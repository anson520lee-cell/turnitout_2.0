import assert from "node:assert/strict";
import { test } from "node:test";
import { freeRange, liveScore, rangeOf } from "../lib/scanning/free-range";

test("the live score moves while reading and ends inside the final range", () => {
  const finalShare = 0.58;
  const final = freeRange(finalShare, "elevated");
  assert.equal(final.lo, 60);
  // Early on it follows the sentences read so far, up or down.
  const early = liveScore(0.1, 0.15, finalShare, final);
  const later = liveScore(0.7, 0.4, finalShare, final);
  assert.ok(later > early, "it rises when flagged sentences are met");
  // Everything read: the last value sits within the final range.
  const end = liveScore(finalShare, 1, finalShare, final);
  assert.ok(end > final.lo && end < final.hi);
  assert.deepEqual(rangeOf(end), final);
});

test("the live score stays in range even when the level floors the final range", () => {
  const final = freeRange(0.3, "elevated");
  const end = liveScore(0.3, 1, 0.3, final);
  assert.ok(end >= final.lo && end <= final.hi);
});
