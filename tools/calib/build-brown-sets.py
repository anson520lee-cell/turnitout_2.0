"""Second human baseline: Brown corpus (1961 published prose, several genres), cut into
1,200-2,000 character chunks with random paragraph breaks.
  curl -L -o brown.zip https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/brown.zip && unzip brown.zip
  python3 tools/calib/build-brown-sets.py brown /tmp/bt2 && npx tsx tools/calib/backtest.ts /tmp/bt2
"""
import glob, json, os, random, re, sys

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
random.seed(5)


def detok(toks):
    s = " ".join(toks)
    s = re.sub(r" ([.,;:!?)\]%])", r"\1", s)
    s = re.sub(r"([(\[]) ", r"\1", s)
    s = s.replace("`` ", "“").replace(" ''", "”").replace(" '", "’")
    return s.replace(";;", ";")


for cat, pat in [("learned", "cj*"), ("belles", "cf*"), ("lore", "cg*"), ("editorial", "cb*"), ("fiction", "ck*"), ("govt", "ch*")]:
    items = []
    for f in sorted(glob.glob(os.path.join(src, pat))):
        cur = []
        for line in open(f, encoding="latin-1"):
            toks = [t.rsplit("/", 1)[0] for t in line.split()]
            if not toks:
                continue
            cur.append(detok(toks))
            if sum(len(x) for x in cur) >= 1200:
                txt = "".join(x + ("\n\n" if random.random() < 0.25 else " ") for x in cur).strip()
                if len(txt) <= 2000:
                    items.append({"text": txt})
                cur = []
    json.dump(items, open(os.path.join(out, f"human_brown_{cat}.json"), "w"))
