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

## Update v1.4 (same day): a Gemini essay slipped through
A 4,600-character Gemini essay ("The Tyranny of Metrics") rated Moderate under v1.3 (even paragraphs only; its sentences vary normally).
What set it apart: its vocabulary is unusually evenly varied (0.89 distinct words per 100; human abstracts median 0.81, 99th percentile 0.90; 2,587 Brown-corpus chunks from six genres almost never exceed 0.86) and its words are long.
The old "lexical diversity" signal assumed the opposite (repeating = AI), so it is now reversed and counts toward the level (v1.4).

| v1.4 | Result |
|---|---|
| 3,000 human paper abstracts | 10% moderate or higher, 1.9% elevated (unchanged) |
| 2,587 human chunks, Brown corpus, six genres (1961, second baseline) | 0.4–5% moderate or higher, at most 1% elevated |
| 47 AI samples | about 72% moderate or higher (v1.3: about 21%) |
| The Gemini essay | Elevated |

Caveat: the AI samples were written by one model family, so the vocabulary signal is validated mainly on that style; paraphrased or heavily edited AI text is untested.

## Real student essay check (2026-10-13)
A Hong Kong student's own essay (mobility vs accessibility, with citations and ordinary grammar slips, 678 words) rates Low under v1.4: sentence variation 0, vocabulary variety 6 (85 distinct words per 100, normal for people). Only connectors scored (53). Added to the human samples as a regression test.
