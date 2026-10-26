import { test } from "node:test";
import assert from "node:assert/strict";
import { reportBasis, textHash } from "../lib/auto-report/reuse";

test("the same text gives the same fingerprint, whatever the line endings or edge spaces", () => {
  assert.equal(textHash("One.\nTwo."), textHash("  One.\r\nTwo.\n\n"));
});

test("a different text gives a different fingerprint", () => {
  assert.notEqual(textHash("One. Two."), textHash("One. Two!"));
});

test("a result is only reused when prompt, model, effort and piece size are all the same", () => {
  const base = { prompt: "p", model: "m", effort: "low", pieceSize: 3500 };
  assert.equal(reportBasis(base), reportBasis({ ...base }));
  for (const change of [{ prompt: "q" }, { model: "n" }, { effort: "high" }, { pieceSize: 3000 }]) {
    assert.notEqual(reportBasis(base), reportBasis({ ...base, ...change }));
  }
});
