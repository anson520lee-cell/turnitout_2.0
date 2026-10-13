"""Builds the sets that tools/calib/backtest.ts reads.

Human set: abstracts of peer-reviewed papers published before 2020 from the ACL
Anthology (https://github.com/acl-org/acl-anthology), 500-2,000 characters,
the same range the free scan accepts.
AI set: tools/calib/ai-samples/*.txt (written in ChatGPT / Gemini style; "=====" separates texts).

  git clone --depth 1 https://github.com/acl-org/acl-anthology.git acl
  python3 tools/calib/build-backtest-sets.py acl /tmp/bt
  npx tsx tools/calib/backtest.ts /tmp/bt
"""
import glob, json, os, random, re, sys
import xml.etree.ElementTree as ET

repo, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
rows = []
for f in sorted(glob.glob(os.path.join(repo, "data/xml/*.xml"))):
    try:
        root = ET.parse(f).getroot()
    except ET.ParseError:
        continue
    for vol in root.iter("volume"):
        year = vol.find("meta/year")
        if year is None or int(year.text) >= 2020:
            continue
        for paper in vol.iter("paper"):
            a = paper.find("abstract")
            if a is None:
                continue
            t = re.sub(r"\s+", " ", "".join(a.itertext())).strip()
            if 500 <= len(t) <= 2000:
                rows.append({"year": int(year.text), "text": t})
random.seed(2)
random.shuffle(rows)
json.dump(rows[:3000], open(os.path.join(out, "human_abs.json"), "w"))
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai-samples")
for name in sorted(glob.glob(os.path.join(here, "*.txt"))):
    parts = [p.strip() for p in open(name).read().split("=====") if p.strip()]
    json.dump([{"text": p} for p in parts], open(os.path.join(out, "ai_" + os.path.basename(name)[:-4] + ".json"), "w"))
print(len(rows), "human abstracts found; wrote", out)
