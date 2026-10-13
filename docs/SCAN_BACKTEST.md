# Free scan back-test (2026-10-13)

Method: `tools/calib/build-backtest-sets.py` + `tools/calib/backtest.ts`.
Human texts: 3,000 abstracts of peer-reviewed papers published before 2020 (ACL Anthology, 500-2,000 characters; many by non-native writers).
AI texts: 47 samples written in ChatGPT / Gemini style (22 abstracts, 25 essays). Small set: treat AI figures as rough.

| | Human flagged moderate or higher | Human flagged elevated | AI flagged moderate or higher |
|---|---|---|---|
| Before (v1.2) | 71.5% | 10.3% | 62% (29 of 47) |
| After (v1.3) | 9.4% | 1.7% | about 21% (10 of 47) |

What the data showed
- Only sentence-length variation separated AI from human abstracts (AUC about 0.7). Opening repetition, vocabulary spread and paragraph evenness were at or below chance, so they are shown but no longer decide the level.
- A few sentences give a noisy spread, so short texts now count for less; "However," twice is normal academic writing, so connectors need three hits.
- Modern AI text with natural sentence variety and no stock phrases is not separable by these statistics (0 of 10 caught).
- Not tested: real human student essays, Chinese text, edited or paraphrased AI text.
