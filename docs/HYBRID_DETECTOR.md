# Hybrid detector (classifier + sentence reviewer)

Status: the code is off by default. Nothing changes until `DETECTOR_ENABLED=true` and a service is deployed.

## Why

The sentence reviewer (mix1) flags formal, tidy human writing: in the offline test 49% of the hard formal-human
samples (Brown 1961, IvyPanda, DSE exemplar, classmate essay, BAWE) came out red, while Turnitin gave the DSE
exemplar 0%. Jordan decided on 2026-10-22 to prefer fewer false positives. The open classifier desklib rates
the same human texts as human almost always but cannot say which sentences are the problem, so the report keeps the
reviewer's sentence marks and the classifier only moves the headline score.

## What changes

`headlineScore(summary)` is the mean of the classifier probability and `aiScore(flaggedShare)` when the report has a
`summary.detector` value, otherwise `aiScore(flaggedShare)` as before. The report page, the scan result, the gauge,
the report's stored `overall`, and the admin activity list use it. Reports made without the classifier, and the
free scan (a different path), are unchanged.

## Offline replay (no new model calls; red = score >= 60, curve centre 0.6)

Samples that have both a mix1 backtest and a classifier score (formal human 61, ESL human 119, polished AI 155,
ESL-voice AI 54, humanised AI 65).

| Method | Formal human red | ESL human red | Polished AI | ESL-voice AI | Humanised AI |
|---|---|---|---|---|---|
| mix1 (today) | 49% | 2% | 85% | 74% | 22% |
| mean(classifier, mix1) | 5% | 0% | 90% | 93% | 34% |
| classifier alone | 0% | 0% | 92% | 100% | 66% |

The mean puts about half of the formal human texts in the yellow band (30 to 59), not green.

## Caveats

- The classifier may have seen old public corpora (Brown, BAWE) in training, so the human numbers can be optimistic.
- It missed the one AI-assisted human draft Turnitin flagged at 59% (classifier 0.07). With the mean this kind of text
  now scores lower than before. That is the price of fewer false positives.
- Only one Turnitin-labelled AI-positive sample exists; more Turnitin reports are needed to validate.
- The service scores up to 12 windows of about 250 words; the replay used overlapping windows, so expect small differences.
- Text is sent only to the service you host and is not logged. Check the privacy text names processors correctly before switching it on.

## Classifier-only mode (DETECTOR_MODE=primary)

Jordan's goal (2026-10-22) is also to cut the DeepSeek bill. With `DETECTOR_ENABLED=true` and `DETECTOR_MODE=primary`:

- **Free daily reports** (orders with price 0) are scored by the classifier alone: `POST /sentences` returns a score per
  sentence (the highest score of the half-overlapping 250-word windows that cover it), a sentence at 0.9 or more is
  marked High, and the existing stitcher builds the report from that (`lib/auto-report/classifier-report.ts`). No DeepSeek call.
  The report has the marks and the score but no reasons or questions.
- **Free scan written feedback** (`/api/scan-feedback`) is built the same way for a fresh scan. A re-check of a revised draft still uses DeepSeek.
- **Paid reports** keep DeepSeek (reasons and questions) with the classifier mixed into the score as above.
- If the service does not answer, free reports and feedback fall back to DeepSeek, so nothing breaks.

Offline replay of the marking rule (share of sentences covered by a window at 0.9 or more, same S-curve, red = 60):
formal human 0% red, ESL human 0%, polished AI 92%, ESL-voice AI 100%, humanised AI 65%.

Limits: no explanations; a short text (one window) gets one score for all its sentences; on the AFIC essay Turnitin
rated 59% (22 flagged sentences) the classifier scored every window 0.03 to 0.13, so nothing is marked there; and a
950-word text took about 8 s on 4 CPU threads once warm.
