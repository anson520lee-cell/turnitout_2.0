import assert from "node:assert/strict";
import { test } from "node:test";
import { freeRange, liveScore, rangeOf } from "../lib/scanning/free-range";

test("the live score follows the sentences read and ends inside the final range", () => {
  const finalShare = 0.58;
  const final = freeRange(finalShare, "elevated");
  assert.equal(final.lo, 60);
  // Mid-scan it is the AI score of the share read so far: up on flagged sentences, down on clear ones.
  assert.ok(liveScore(0.7, 0.4, finalShare, final) > liveScore(0.3, 0.4, finalShare, final));
  assert.ok(liveScore(0.2, 0.4, finalShare, final) < 20);
  // Everything read: inside the final range.
  const end = liveScore(finalShare, 1, finalShare, final);
  assert.ok(end > final.lo && end < final.hi);
  assert.deepEqual(rangeOf(end), final);
});

test("the live score stays in range even when the level floors the final range", () => {
  const final = freeRange(0.3, "elevated");
  const end = liveScore(0.3, 1, 0.3, final);
  assert.ok(end >= final.lo && end <= final.hi);
});
