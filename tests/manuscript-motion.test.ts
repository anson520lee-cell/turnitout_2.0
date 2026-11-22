import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REST_LIFT,
  createField,
  liftTarget,
  ringLift,
  stepField,
  timing,
  type Field,
  type FieldInput,
} from "../components/visuals/manuscript-motion";

const N = 14;
const FRAME = 1000 / 60;
const idle = (over: Partial<FieldInput> = {}): FieldInput => ({
  hover: -1,
  inside: false,
  selected: 0,
  pinned: -1,
  focusUntil: 0,
  pressing: false,
  reduced: false,
  ...over,
});
/** Run the field for `ms`, calling `each` after every frame. */
function run(field: Field, input: FieldInput, ms: number, each?: (t: number) => void) {
  let moving = false;
  for (let t = 0; t < ms; t += FRAME) {
    moving = stepField(field, input, FRAME);
    each?.(t + FRAME);
  }
  return moving;
}
/** A field that has been sitting with sentence 0 selected. */
function settled() {
  const field = createField(N);
  run(field, idle(), 3000);
  return field;
}

test("the hairline appears in the same frame as the pointer and fades within 0.1 s", () => {
  const field = settled();
  const over = idle({ hover: 5, inside: true, selected: 5 });
  stepField(field, over, FRAME);
  assert.equal(field.probe, 5);
  assert.equal(field.probeAlpha, 1, "visible on the first frame");
  run(field, over, 300);
  run(field, idle({ selected: 5 }), 100);
  assert.ok(field.probeAlpha < 0.25, `faded after leaving (${field.probeAlpha.toFixed(2)})`);
});

test("a line lifts when the pointer rests on it, not when it sweeps past", () => {
  const swept = settled();
  // Cross eight sentences at 30 ms each, a quick sweep.
  for (let s = 2; s < 10; s++) run(swept, idle({ hover: s, inside: true, selected: s }), 30);
  for (let s = 2; s < 9; s++) assert.ok(swept.lift[s] < 0.1, `sentence ${s + 1} barely rose (${swept.lift[s].toFixed(3)})`);

  const rested = settled();
  const on = idle({ hover: 6, inside: true, selected: 6 });
  run(rested, on, FRAME);
  assert.ok(rested.lift[6] < 0.05, "no jump on the first frame");
  run(rested, on, 400);
  assert.ok(rested.lift[6] > 0.85, `risen after resting 0.4 s (${rested.lift[6].toFixed(2)})`);
});

test("neighbours rise less and later than the line under the pointer", () => {
  const field = settled();
  const near = new Float32Array(N);
  near[5] = 1;
  near[7] = 1;
  const on = idle({ hover: 6, inside: true, selected: 6, near });
  let crossed = -1;
  run(field, on, 1200, (t) => {
    if (crossed < 0 && field.lift[5] > 0.5 * 0.42) crossed = t;
    assert.ok(field.lift[5] <= field.lift[6] + 1e-6, "a neighbour never passes the line under the pointer");
  });
  assert.ok(field.lift[5] < 0.45 && field.lift[5] > 0.3, `neighbour lift ${field.lift[5].toFixed(2)}`);
  assert.ok(crossed > 200, `neighbour reached half height at ${crossed.toFixed(0)} ms`);
});

test("lines hold for a moment, the most lifted settle last, and the light fades after them", () => {
  const field = settled();
  const near = new Float32Array(N);
  near[7] = 0.8;
  run(field, idle({ hover: 6, inside: true, selected: 6, near }), 900);
  const start = field.lift[6];
  // The pointer leaves the sheet: sentence 6 stays selected, so it rests a little raised.
  const away = idle({ selected: 6 });
  let linesDone = -1,
    lightDone = -1,
    neighbourDown = -1,
    mainDown = -1;
  run(field, away, 6000, (t) => {
    if (t <= 150) assert.ok(field.lift[6] > 0.97 * start, "still floating 150 ms after the pointer left");
    if (neighbourDown < 0 && field.lift[7] < 0.05) neighbourDown = t;
    if (mainDown < 0 && field.lift[6] < REST_LIFT + 0.05) mainDown = t;
    const still = Array.from(field.lift).every((l, s) => Math.abs(l - (s === 6 ? REST_LIFT : 0)) < 0.02);
    if (linesDone < 0 && still) linesDone = t;
    if (lightDone < 0 && field.energy < 0.05) lightDone = t;
  });
  assert.ok(neighbourDown < mainDown, `neighbour settled at ${neighbourDown.toFixed(0)} ms, line at ${mainDown.toFixed(0)} ms`);
  assert.ok(linesDone > 0 && lightDone > linesDone, `lines still at ${linesDone.toFixed(0)} ms, light gone at ${lightDone.toFixed(0)} ms`);
  assert.ok(lightDone < 3500, "the light is gone within a few seconds");
  assert.ok(Math.abs(field.lift[6] - REST_LIFT) < 0.01, "the chosen sentence stays a little raised");
});

test("a sentence read from the chart or keyboard rises fully, then rests", () => {
  const field = settled();
  const reading = idle({ selected: 9, focusUntil: field.t + timing.read });
  stepField(field, reading, FRAME);
  assert.equal(field.probe, 9, "the hairline moves on the first frame");
  let risen = -1;
  run(field, reading, timing.read - 50, (t) => {
    if (risen < 0 && field.lift[9] >= 0.9) risen = t;
  });
  assert.ok(risen > 0 && risen < 300, `risen after ${risen.toFixed(0)} ms`);
  const done = run(field, reading, 3000);
  assert.ok(Math.abs(field.lift[9] - REST_LIFT) < 0.01, "rests a little raised afterwards");
  assert.equal(done, false, "the sheet comes to rest");
});

test("a press lifts the sentence further and the release wave crosses the sheet", () => {
  const field = settled();
  run(field, idle({ hover: 3, inside: true, selected: 3 }), 600);
  const before = field.lift[3];
  run(field, idle({ hover: 3, inside: true, selected: 3, pressing: true }), 300);
  assert.ok(field.lift[3] > before + 0.2, "pressing raises it further");
  assert.ok(liftTarget(field, idle({ hover: 3, inside: true, selected: 3, pressing: true }), 3) > 1.2);

  field.ring = 0;
  const radiusAt = (ms: number) => {
    field.ring = ms;
    let best = 0,
      at = 0;
    for (let d = 0; d < 1.2; d += 0.005) {
      const v = ringLift(field, d);
      if (v > best) [best, at] = [v, d];
    }
    return { best, at };
  };
  const early = radiusAt(150),
    late = radiusAt(900);
  assert.ok(late.at > early.at + 0.3, "the wave travels outward");
  assert.ok(late.best < early.best, "and weakens as it goes");
  field.ring = timing.ring + 1;
  run(field, idle({ selected: 3 }), FRAME);
  assert.equal(field.ring, -1, "and ends");
  assert.equal(ringLift(field, 0.3), 0);
});

test("reduced motion keeps the sheet still but still marks the sentence being read", () => {
  const field = settled();
  const input = idle({ hover: 4, inside: true, selected: 4, pressing: true, reduced: true });
  field.ring = 0;
  field.tap = 0;
  const moving = stepField(field, input, FRAME);
  assert.equal(moving, false);
  assert.ok(Array.from(field.lift).every((l) => l === 0));
  assert.equal(field.bend, 0);
  assert.equal(field.energy, 0);
  assert.equal(field.ring, -1);
  assert.equal(field.tap, -1);
  assert.equal(field.probe, 4);
  assert.equal(field.probeAlpha, 1);
  stepField(field, idle({ selected: 4, reduced: true }), FRAME);
  assert.equal(field.probeAlpha, 0, "and the mark goes at once");
});

test("the opening read-through visits every sentence once, then stops", () => {
  const field = settled();
  field.intro = 0;
  const seen: number[] = [];
  run(field, idle(), timing.introStep * N + 400, () => {
    if (field.probeAlpha === 1 && seen.at(-1) !== field.probe) seen.push(field.probe);
  });
  assert.deepEqual(seen, Array.from({ length: N }, (_, i) => i));
  assert.equal(field.intro, -1);
  run(field, idle(), 3000);
  assert.equal(stepField(field, idle(), FRAME), false, "and the sheet comes to rest");
});
