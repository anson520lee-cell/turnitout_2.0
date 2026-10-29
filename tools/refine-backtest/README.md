# Writing Refinement backtest

Runs the real detector prompt (`WORD_1`, pieces of `PIECE_SIZE`, same stitching and score curve) and the real rewrite
code (`REWRITE_PROMPT`, `checkRewrite`, rounds, keep-the-best) straight against DeepSeek. No Vercel, no credits, no database.

```
NODE_USE_ENV_PROXY=1 npx tsx --conditions=react-server tools/refine-backtest/run.ts --label v5 --rescore 3
```

Options: `--only name,name`, `--rounds N`, `--rescore N` (score the original and the kept text N more times),
`--prompt-file path` (try a rewrite prompt without editing rewrite.ts), `--human` (add four Brown-corpus human controls),
`RW_MODEL` / `RW_EFFORT` (a different writer model), `DETECTOR_PROMPT_FILE`. Results per essay go to `results/<label>/`.
Test essays are in `essays/` (five Gemini essays supplied by the owner).

Read it with care: the detector is noisy. The same text scored 4, 91 and 94 on three runs, so a single re-check says little
and the lowest of several rounds is partly luck. Judge a change by `--rescore` means over all five essays, and ideally two runs.
The detector here is the site's own (DeepSeek Flash, low effort, the default); it says nothing about Turnitin or GPTZero.

## 2026-10-29 results (kept text, mean of 3 fresh re-checks; round 1 = first re-check after the first rewrite)

| prompt | round 1 (5 essays) | mean of re-checks, per essay | mean |
|---|---|---|---|
| before #114 (short blunt sentences) | 99 99 96 99 99 / 100 56 5 100 97 (two runs) | 64 (second run: 39 60 96 53 74) | 64 |
| #114 as opened | 52 95 27 94 99 | 8 1 60 34 11 | 23 (but text doubled in length) |
| + length limit against the student's sentence, concrete images, no invented experience | 72 5 81 30 72 | 11 14 5 66 82 | 36 |
