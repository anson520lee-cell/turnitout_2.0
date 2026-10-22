"""AI-text classifier service for the report's second opinion.

POST /score      {"text": "..."}           ->  {"score": 0..1, "windows": n}
POST /sentences  {"sentences": ["...", ...]}  ->  {"scores": [0..1 per sentence], "windows": n}
GET  /health

/sentences scores overlapping windows of whole sentences (about 250 words, half overlap) and gives each sentence the
highest score of the windows that cover it, so the site can mark the stretches that read as AI.

The model is desklib/ai-text-detector-v1.01 (MIT, DeBERTa-v3-large). A long text is cut into windows of about 250
words (whole sentences); at most MAX_WINDOWS evenly spread windows are scored, and the score is their mean, which
is what the offline replay in docs/HYBRID_DETECTOR.md measured. Every request needs `Authorization: Bearer
$DETECTOR_TOKEN`; the service refuses to start without a token. Texts are never logged or stored.
"""
import hmac
import os
import re

import torch
import torch.nn as nn
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoConfig, AutoModel, AutoTokenizer, PreTrainedModel

MODEL = os.environ.get("DETECTOR_MODEL", "desklib/ai-text-detector-v1.01")
TOKEN = os.environ.get("DETECTOR_TOKEN", "")
WIN_WORDS = int(os.environ.get("WIN_WORDS", "250"))
MAX_WINDOWS = int(os.environ.get("MAX_WINDOWS", "12"))
MAX_TOKENS = 768
MAX_CHARS = 200_000

if not TOKEN:
    raise RuntimeError("DETECTOR_TOKEN is required")
torch.set_num_threads(int(os.environ.get("TORCH_THREADS", "4")))


class DesklibAIDetectionModel(PreTrainedModel):
    config_class = AutoConfig

    def __init__(self, config):
        super().__init__(config)
        self.model = AutoModel.from_config(config)
        self.classifier = nn.Linear(config.hidden_size, 1)
        self.post_init()

    def forward(self, input_ids, attention_mask=None):
        h = self.model(input_ids, attention_mask=attention_mask)[0]
        m = attention_mask.unsqueeze(-1).float()
        return self.classifier((h * m).sum(1) / m.sum(1).clamp(min=1e-9))


tok = AutoTokenizer.from_pretrained(MODEL)
net = DesklibAIDetectionModel.from_pretrained(MODEL).eval()


def _warm_up():
    """One throw-away pass at start so the first real request is not slow."""
    with torch.no_grad():
        enc = tok(["Warm up."], return_tensors="pt")
        net(enc["input_ids"], enc["attention_mask"])


_warm_up()


def sentences(text: str) -> list[str]:
    out: list[str] = []
    for para in [p for p in re.split(r"\n\s*\n|\n", text) if p.strip()]:
        out += [s.strip() for s in re.split(r'(?<=[.?!])\s+(?=[A-Z“"(])', para.strip()) if s.strip()]
    return out


def windows(text: str) -> list[str]:
    ss = sentences(text)
    wins: list[str] = []
    cur: list[str] = []
    n = 0
    for s in ss:
        cur.append(s)
        n += len(s.split())
        if n >= WIN_WORDS:
            wins.append(" ".join(cur))
            cur, n = [], 0
    if cur and (not wins or n >= WIN_WORDS // 3):
        wins.append(" ".join(cur))
    elif cur:
        wins[-1] += " " + " ".join(cur)
    if len(wins) > MAX_WINDOWS:
        step = (len(wins) - 1) / (MAX_WINDOWS - 1)
        wins = [wins[round(i * step)] for i in range(MAX_WINDOWS)]
    return wins


MAX_SENT_WINDOWS = int(os.environ.get("MAX_SENT_WINDOWS", "40"))
MAX_SENTENCES = 2000


def sentence_windows(ss: list[str]) -> list[tuple[int, int]]:
    """Windows (start, end) of whole sentences of about WIN_WORDS words, half overlapping; at most MAX_SENT_WINDOWS."""
    n = len(ss)
    spans: list[tuple[int, int]] = []
    i = 0
    while i < n:
        j, words = i, 0
        while j < n and words < WIN_WORDS:
            words += len(ss[j].split())
            j += 1
        spans.append((i, j))
        if j >= n:
            break
        i += max(1, (j - i) // 2)
    if len(spans) > MAX_SENT_WINDOWS:
        step = (len(spans) - 1) / (MAX_SENT_WINDOWS - 1)
        spans = [spans[round(k * step)] for k in range(MAX_SENT_WINDOWS)]
    return spans


@torch.no_grad()
def prob(texts: list[str]) -> list[float]:
    enc = tok(texts, truncation=True, max_length=MAX_TOKENS, padding=True, return_tensors="pt")
    return torch.sigmoid(net(enc["input_ids"], enc["attention_mask"])[:, 0]).tolist()


def auth(authorization: str = Header(default="")):
    if not hmac.compare_digest(authorization, f"Bearer {TOKEN}"):
        raise HTTPException(status_code=401)


class Body(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health():
    return {"ok": True}


class SentBody(BaseModel):
    sentences: list[str] = Field(min_length=1, max_length=MAX_SENTENCES)


@app.post("/sentences", dependencies=[Depends(auth)])
def sentences_score(body: SentBody):
    ss = [x.strip() for x in body.sentences]
    if sum(len(x) for x in ss) > MAX_CHARS or not any(ss):
        raise HTTPException(status_code=422, detail="bad text")
    spans = sentence_windows(ss)
    ps: list[float] = []
    for k in range(0, len(spans), 4):
        ps += prob([" ".join(ss[a:b]) for a, b in spans[k : k + 4]])
    scores = [0.0] * len(ss)
    for (a, b), p in zip(spans, ps):
        for i in range(a, b):
            scores[i] = max(scores[i], p)
    return {"scores": [round(x, 4) for x in scores], "windows": len(spans)}


@app.post("/score", dependencies=[Depends(auth)])
def score(body: Body):
    wins = windows(body.text)
    if not wins:
        raise HTTPException(status_code=422, detail="no text")
    ps: list[float] = []
    for i in range(0, len(wins), 4):
        ps += prob(wins[i : i + 4])
    return {"score": round(sum(ps) / len(ps), 4), "windows": len(ps)}
