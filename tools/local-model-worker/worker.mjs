#!/usr/bin/env node
// 0% local model worker.
//
// Runs on the owner's computer next to Open WebUI. It asks the website for
// work, sends the text to the local model through Open WebUI's
// OpenAI-compatible API, and posts the result back. The computer only makes
// outgoing requests, so nothing on it is exposed to the internet.
//
// Node 18 or newer. No packages to install.
//
//   node worker.mjs               run (settings from .env next to this file)
//   node worker.mjs --check       test the website and Open WebUI settings
//   node worker.mjs --new-secret  print a new random MODEL_WORKER_SECRET
//
// Privacy: this program never writes essay text or model output to the
// screen or to disk. Logs show job ids, character counts and timings only.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

if (process.argv.includes("--new-secret")) {
  console.log(randomBytes(32).toString("hex"));
  process.exit(0);
}

/** Reads KEY=VALUE lines from .env. Real environment variables win. */
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnv(join(here, ".env"));

const num = (v, d) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const trimSlash = (s) => (s ?? "").trim().replace(/\/+$/, "");

const cfg = {
  site: trimSlash(process.env.SITE_URL),
  secret: (process.env.MODEL_WORKER_SECRET ?? "").trim(),
  webui: trimSlash(process.env.OPENWEBUI_URL || "http://localhost:3000"),
  apiKey: (process.env.OPENWEBUI_API_KEY ?? "").trim(),
  model: (process.env.OPENWEBUI_MODEL ?? "").trim(),
  chatPath: process.env.CHAT_PATH || "/api/chat/completions",
  modelsPath: process.env.MODELS_PATH || "/api/models",
  pollSeconds: num(process.env.POLL_SECONDS, 4),
  idlePollSeconds: num(process.env.IDLE_POLL_SECONDS, 15),
  idleAfterMinutes: num(process.env.IDLE_AFTER_MINUTES, 10),
  chunkChars: num(process.env.CHUNK_CHARS, 4000),
  modelTimeoutMinutes: num(process.env.MODEL_TIMEOUT_MINUTES, 15),
  temperature: num(process.env.TEMPERATURE, 0.3),
};

const time = () => new Date().toLocaleTimeString("zh-HK", { hour12: false });
const log = (...a) => console.log(`[${time()}]`, ...a);
const warn = (...a) => console.warn(`[${time()}] ⚠`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const n = (x) => x.toLocaleString("en-HK");
const short = (id) => String(id).slice(0, 8);

function checkSettings() {
  const problems = [];
  if (!/^https?:\/\//.test(cfg.site)) problems.push("SITE_URL 未設定(例如 https://你的網站.vercel.app)");
  else if (cfg.site.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(cfg.site))
    problems.push("SITE_URL 必須用 https://(本機測試除外)");
  if (cfg.secret.length < 24) problems.push("MODEL_WORKER_SECRET 未設定或太短(用 node worker.mjs --new-secret 產生一個)");
  if (!cfg.apiKey) problems.push("OPENWEBUI_API_KEY 未設定(Open WebUI > 設定 > 帳號 > API 金鑰)");
  if (!cfg.model) problems.push("OPENWEBUI_MODEL 未設定(跑 node worker.mjs --check 會列出可用模型)");
  return problems;
}

// ---------------------------------------------------------------------------
// Website
// ---------------------------------------------------------------------------

class SiteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function site(path, body) {
  const res = await fetch(`${cfg.site}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.secret}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new SiteError(res.status, json.error || `HTTP ${res.status}`);
  return json;
}

const nextJob = (kind) => site("/api/model-worker/next", { model: cfg.model, ...(kind ? { kind } : {}) });
const report = (id, body) => site(`/api/model-worker/jobs/${id}`, body);

// ---------------------------------------------------------------------------
// Open WebUI
// ---------------------------------------------------------------------------

/** Reasoning models put their thinking in the reply; the site only wants the answer. */
function stripThinking(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<details\s+type="reasoning"[\s\S]*?<\/details>/gi, "")
    .trim();
}

async function chat(system, user, maxTokens) {
  const res = await fetch(`${cfg.webui}${cfg.chatPath}`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      temperature: cfg.temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(cfg.modelTimeoutMinutes * 60_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Open WebUI HTTP ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Open WebUI returned no message");
  const answer = stripThinking(content);
  if (!answer) throw new Error("The model returned an empty answer");
  return answer;
}

const SENTENCE = /[^.!?。！？]+[.!?。！？]+["'”’)」』]*\s*|[^.!?。！？]+$/g;
const CJK_END = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]$/;

/**
 * Splits text into pieces of about `max` characters for a model with a small
 * context: at blank lines where possible, else at sentence ends, else at
 * spaces. `paragraphEnd` says whether a paragraph break follows the piece, so
 * the answers can be joined back without inventing new paragraphs.
 */
function chunks(text, max) {
  const pieces = [];
  let current = "";
  const push = (paragraphEnd) => {
    if (current.trim()) pieces.push({ text: current.trim(), paragraphEnd });
    else if (paragraphEnd && pieces.length) pieces[pieces.length - 1].paragraphEnd = true;
    current = "";
  };
  for (const p of text.split(/\n\s*\n/)) {
    if (p.length <= max) {
      if (current && current.length + p.length + 2 > max) push(true);
      current = current ? `${current}\n\n${p}` : p;
      continue;
    }
    push(true);
    for (const s of p.match(SENTENCE) ?? [p]) {
      if (current && current.length + s.length > max) push(false);
      if (s.length <= max) {
        current += s;
        continue;
      }
      let rest = s;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(" ", max);
        if (cut < max / 2) cut = max; // no space to cut at (e.g. Chinese): cut by length
        pieces.push({ text: rest.slice(0, cut).trim(), paragraphEnd: false });
        rest = rest.slice(cut);
      }
      current = rest;
    }
    push(true);
  }
  push(true);
  return pieces;
}

/** Joins the model's answers the way the original pieces were joined. */
function joinPieces(pieces, answers) {
  return answers
    .map((a, i) => (i === answers.length - 1 ? a : a + (pieces[i].paragraphEnd ? "\n\n" : CJK_END.test(a) ? "" : " ")))
    .join("");
}

/** Wraps text in the job's tag, so the model can tell the text from its instructions. */
function wrap(tag, text) {
  return `<${tag}>\n${text.replaceAll(`</${tag}>`, `</ ${tag}>`)}\n</${tag}>`;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

const LABEL = { scan_feedback: "免費掃描評語", refinement_draft: "Refinement 草稿" };

async function runJob(job) {
  const started = Date.now();
  log(`開始 ${LABEL[job.kind] ?? job.kind} ${short(job.id)}(${n(job.input.length)} 字元)`);
  try {
    let output;
    if (!job.chunk) {
      output = await chat(job.system, wrap(job.tag, job.input), job.maxTokens);
    } else {
      const pieces = chunks(job.input, cfg.chunkChars);
      const parts = [];
      for (const [i, piece] of pieces.entries()) {
        parts.push(await chat(job.system, wrap(job.tag, piece.text), job.maxTokens));
        if (pieces.length > 1) log(`  ${short(job.id)} 第 ${i + 1}/${pieces.length} 段完成`);
        if (i < pieces.length - 1) {
          await report(job.id, { progress: true, model: cfg.model }).catch(() => {});
          // Visitors waiting for scan feedback shouldn't wait for a whole essay.
          await drainScanFeedback();
        }
      }
      output = joinPieces(pieces, parts);
    }
    await report(job.id, { ok: true, output });
    log(`完成 ${short(job.id)}:${n(output.length)} 字元,用了 ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    warn(`失敗 ${short(job.id)}:${message}`);
    if (e instanceof SiteError && e.status === 409) return; // expired or replaced on the site
    await report(job.id, { ok: false, error: message.slice(0, 300) }).catch(() => {});
  }
}

async function drainScanFeedback() {
  for (;;) {
    let res;
    try {
      res = await nextJob("scan_feedback");
    } catch {
      return;
    }
    if (!res.job) return;
    await runJob(res.job);
  }
}

// ---------------------------------------------------------------------------
// --check
// ---------------------------------------------------------------------------

async function check() {
  let ok = true;
  console.log("檢查設定…\n");
  for (const p of checkSettings()) {
    console.log(`✗ ${p}`);
    ok = false;
  }

  try {
    const res = await fetch(`${cfg.webui}${cfg.modelsPath}`, {
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 401 || res.status === 403 ? "(API 金鑰不對,或 Open WebUI 未開啟 API 金鑰)" : ""}`);
    const ids = ((await res.json())?.data ?? []).map((m) => m.id);
    console.log(`✓ 連到 Open WebUI:${cfg.webui}`);
    console.log(`  可用模型:${ids.join(", ") || "(沒有)"}`);
    if (cfg.model && !ids.includes(cfg.model)) {
      console.log(`✗ 找不到 OPENWEBUI_MODEL「${cfg.model}」,請從上面複製一個名稱`);
      ok = false;
    } else if (cfg.model) {
      const t = Date.now();
      await chat("Reply with the single word OK.", "Say OK.", 20);
      console.log(`✓ 模型「${cfg.model}」有回應(${((Date.now() - t) / 1000).toFixed(1)} 秒)`);
    }
  } catch (e) {
    console.log(`✗ 連不到 Open WebUI(${cfg.webui}):${e instanceof Error ? e.message : e}`);
    ok = false;
  }

  if (cfg.site && cfg.secret) {
    try {
      await site("/api/model-worker/next", { model: cfg.model || "unknown", check: true });
      console.log(`✓ 連到網站:${cfg.site}`);
    } catch (e) {
      const hint =
        e instanceof SiteError && e.status === 401
          ? "(MODEL_WORKER_SECRET 和 Vercel 上的不一樣)"
          : e instanceof SiteError && e.status === 503
            ? "(網站未開啟本地模型:在 Vercel 設定 MODEL_WORKER_SECRET 後重新部署)"
            : e instanceof SiteError && e.status === 404
              ? "(網站還沒有這個功能,請先部署最新版本)"
              : "";
      console.log(`✗ 連不到網站 ${cfg.site}:${e instanceof Error ? e.message : e}${hint}`);
      ok = false;
    }
  }

  console.log(ok ? "\n全部正常。執行 node worker.mjs 開始工作。" : "\n請修正上面的 ✗ 項目,再跑一次 --check。");
  process.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
  if (process.argv.includes("--check")) return check();

  const problems = checkSettings();
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p}`);
    console.error("\n請在這個資料夾的 .env 檔案填好設定(參考 .env.example)。");
    process.exit(1);
  }

  log(`本地模型 worker 已啟動:${cfg.model} → ${cfg.site}`);
  log("保持這個視窗開著,網站就會把工作交給你的模型。按 Ctrl+C 停止。");

  let lastWork = Date.now();
  let failures = 0;
  let announced = false;
  for (;;) {
    try {
      const res = await nextJob();
      if (!announced || failures > 0) log("已連上網站,等待工作中…");
      announced = true;
      failures = 0;
      if (res.job) {
        await runJob(res.job);
        lastWork = Date.now();
        continue;
      }
    } catch (e) {
      failures++;
      if (e instanceof SiteError && e.status === 401) {
        console.error("✗ 網站拒絕連線:MODEL_WORKER_SECRET 和 Vercel 上的不一樣。");
        process.exit(1);
      }
      if (failures === 1 || failures % 20 === 0) {
        const hint = e instanceof SiteError && e.status === 503 ? "(網站未開啟本地模型)" : "";
        warn(`連不到網站:${e instanceof Error ? e.message : e}${hint},稍後重試…`);
      }
      await sleep(Math.min(60, 5 * failures) * 1000);
      continue;
    }
    const idle = Date.now() - lastWork > cfg.idleAfterMinutes * 60_000;
    await sleep((idle ? cfg.idlePollSeconds : cfg.pollSeconds) * 1000);
  }
}

process.on("SIGINT", () => {
  log("已停止。");
  process.exit(0);
});

main();
