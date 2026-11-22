// How the sample manuscript answers a reader, layer by layer.
//
// Every layer follows the same pointer but on its own clock, so the sheet
// reads as a material rather than a picture:
// 1. The probe (a hairline under the sentence being read) moves in the same
//    frame as the pointer and fades within ~0.1 s when it leaves.
// 2. That sentence lifts off the page within ~0.1–0.2 s. Neighbours lift less
//    and later, and what the pointer just passed keeps floating for a moment.
// 3. The light under the paper builds while the pointer rests and is the last
//    thing to fade (~2 s), after the lines have settled.
// Lifting needs dwell: a quick sweep moves the hairline and throws a little
// ink, but barely raises a line. Pressing lifts the sentence further and the
// release sends a wave across the sheet.
//
// Pure state and arithmetic only, so the timing can be tested without a canvas.

export type Field = {
  /** Field clock, ms. */
  t: number;
  /** Pointer in canvas coordinates (0…1) and its lagging tail. */
  x: number;
  y: number;
  tailX: number;
  tailY: number;
  /** Broad bend of the sheet toward the pointer, 0…1. */
  bend: number;
  /** Light under the paper, built by dwelling, 0…~1.3. */
  energy: number;
  /** Smoothed pointer speed in sheet widths per second. */
  speed: number;
  /** Sentence under the hairline, and the hairline's opacity. */
  probe: number;
  probeAlpha: number;
  /** Sentence the pointer has been resting on, and since when. */
  dwellOn: number;
  dwellStart: number;
  /** Press depth, 0…1. */
  press: number;
  /** How far each sentence is lifted off the page, and how long it holds before settling (ms). */
  lift: Float32Array;
  hold: Float32Array;
  /** Release wave: ms since release, or -1. Origin in canvas coordinates. */
  ring: number;
  ringX: number;
  ringY: number;
  /** Touch ripple: ms since the finger landed, or -1. */
  tap: number;
  tapX: number;
  tapY: number;
  /** Opening read-through: ms since it began, or -1. */
  intro: number;
};

export type FieldInput = {
  /** Sentence under a hovering mouse or pen, -1 when none. */
  hover: number;
  /** A mouse or pen is over the sheet. */
  inside: boolean;
  /** The sentence the readout shows. */
  selected: number;
  /** A sentence held by a click or tap, -1 when none. */
  pinned: number;
  /** Until this field time (ms) the selected sentence is being read from elsewhere (keyboard, chart, tap). */
  focusUntil: number;
  pressing: boolean;
  reduced: boolean;
  /** 0…1 closeness of each sentence to the pointer, used for the neighbours' smaller lift. */
  near?: ArrayLike<number>;
};

/** Time constants, ms. Exported so the tests can reason about them. */
export const timing = {
  /** The sentence under the pointer rises… */
  rise: 85,
  /** …its neighbours follow more slowly. */
  riseNeighbour: 210,
  /** Dwell needed before a line lifts fully. */
  dwell: 220,
  /** Settling back into the page, after holding for HOLD_BASE + HOLD_PER_LIFT × lift. */
  settle: 280,
  holdBase: 30,
  holdPerLift: 320,
  /** The hairline fades this fast once the pointer leaves the line. */
  probeFade: 70,
  /** Light under the paper: builds, then fades. */
  glowIn: 650,
  glowOut: 900,
  /** Opening read-through, per sentence. */
  introStep: 90,
  /** A sentence chosen from the chart, keyboard or a tap stays fully raised this long. */
  read: 1400,
  ring: 1300,
  tap: 520,
} as const;

/** A sentence the reader chose stays a little raised, so the selection reads as lifted. */
export const REST_LIFT = 0.3;
const NEIGHBOUR = 0.42;
const PINNED_WHILE_AWAY = 0.85;
const INTRO_LIFT = 0.62;

export function createField(sentences: number): Field {
  return {
    t: 0,
    x: 0.5,
    y: 0.5,
    tailX: 0.5,
    tailY: 0.5,
    bend: 0,
    energy: 0,
    speed: 0,
    probe: -1,
    probeAlpha: 0,
    dwellOn: -1,
    dwellStart: 0,
    press: 0,
    lift: new Float32Array(sentences),
    hold: new Float32Array(sentences),
    ring: -1,
    ringX: 0.5,
    ringY: 0.5,
    tap: -1,
    tapX: 0.5,
    tapY: 0.5,
    intro: -1,
  };
}

const approach = (value: number, target: number, dt: number, tau: number) =>
  value + (target - value) * (1 - Math.exp(-dt / tau));
const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Sentence the opening read-through is on, or -1. */
export function introSentence(field: Field, sentences: number) {
  if (field.intro < 0) return -1;
  const k = Math.floor(field.intro / timing.introStep);
  return k < sentences ? k : -1;
}

/** Lift each sentence should reach this frame. */
export function liftTarget(field: Field, input: FieldInput, s: number) {
  if (input.reduced) return 0;
  let target = 0;
  if (input.hover >= 0) {
    const dwell = field.dwellOn === input.hover ? field.t - field.dwellStart : 0;
    const d = smoothstep(dwell / timing.dwell);
    target = s === input.hover ? d * (1 + 0.32 * field.press) : NEIGHBOUR * (input.near?.[s] ?? 0) * d;
  }
  if (s === input.pinned) target = Math.max(target, input.inside ? PINNED_WHILE_AWAY : REST_LIFT);
  if (s === input.selected) {
    // Read from elsewhere: rise fully. Otherwise stay a little raised, except
    // under the pointer, where only dwelling lifts it.
    if (field.t < input.focusUntil) target = Math.max(target, 1 + 0.32 * field.press);
    else if (s !== input.hover) target = Math.max(target, REST_LIFT);
  }
  if (introSentence(field, field.lift.length) === s) target = Math.max(target, INTRO_LIFT);
  return target;
}

/**
 * Advance the field by `dt` ms. Returns true while anything is still moving,
 * so the caller can stop drawing once the sheet has come to rest.
 */
export function stepField(field: Field, input: FieldInput, dt: number) {
  const n = field.lift.length;
  field.t += dt;
  let moving = false;

  if (input.hover !== field.dwellOn) {
    field.dwellOn = input.hover;
    field.dwellStart = field.t;
  }

  // 1. The hairline: same frame in, quick fade out.
  const focus = field.t < input.focusUntil ? input.selected : -1;
  const intro = introSentence(field, n);
  const read = input.hover >= 0 ? input.hover : focus >= 0 ? focus : intro;
  if (read >= 0) {
    field.probe = read;
    field.probeAlpha = 1;
  } else if (input.reduced) {
    field.probeAlpha = 0;
  } else if (field.probeAlpha > 0.004) {
    field.probeAlpha = approach(field.probeAlpha, 0, dt, timing.probeFade);
    moving = true;
  } else field.probeAlpha = 0;

  if (input.reduced) {
    field.lift.fill(0);
    field.hold.fill(0);
    field.energy = field.bend = field.press = field.speed = 0;
    field.ring = field.tap = field.intro = -1;
    field.tailX = field.x;
    field.tailY = field.y;
    return false;
  }

  // 2. Lines: rise fast under the pointer, slower around it; hold, then settle.
  for (let s = 0; s < n; s++) {
    const target = liftTarget(field, input, s);
    let lift = field.lift[s];
    if (target >= lift - 0.0005) {
      field.hold[s] = timing.holdBase + timing.holdPerLift * Math.min(1.4, lift);
      lift = approach(lift, target, dt, s === input.hover || s === focus ? timing.rise : timing.riseNeighbour);
    } else if (field.hold[s] > 0) {
      field.hold[s] = Math.max(0, field.hold[s] - dt);
    } else {
      lift = approach(lift, target, dt, timing.settle);
    }
    // Snap the last thousandth, so the sheet really comes to rest.
    if (Math.abs(lift - target) < 0.001) lift = target;
    else moving = true;
    field.lift[s] = lift;
  }

  // Waiting on dwell or on a reading from elsewhere is still motion: the clock must run.
  if (input.hover >= 0 && field.t - field.dwellStart < timing.dwell) moving = true;
  if (field.t < input.focusUntil) moving = true;

  // 3. Light under the paper, the slowest layer. It builds while the pointer
  // rests, dims during a sweep and brightens under a press.
  const glow = input.inside ? (1 + 0.3 * field.press) * (1 - 0.6 * Math.min(1, field.speed / 3)) : 0;
  const nextEnergy = approach(field.energy, glow, dt, glow > field.energy ? timing.glowIn : timing.glowOut);
  if (Math.abs(nextEnergy - glow) > 0.003) moving = true;
  field.energy = Math.abs(nextEnergy - glow) > 0.003 ? nextEnergy : glow;

  // The sheet itself bends toward the pointer and trails behind it.
  const bendTarget = input.inside ? 0.55 + 0.45 * field.press : 0;
  field.bend = approach(field.bend, bendTarget, dt, bendTarget > field.bend ? 200 : 380);
  if (Math.abs(field.bend - bendTarget) > 0.002) moving = true;
  field.tailX = approach(field.tailX, field.x, dt, 205);
  field.tailY = approach(field.tailY, field.y, dt, 205);
  if (Math.abs(field.tailX - field.x) + Math.abs(field.tailY - field.y) > 0.002) moving = true;

  const pressTarget = input.pressing ? 1 : 0;
  field.press = approach(field.press, pressTarget, dt, input.pressing ? 60 : 180);
  if (Math.abs(field.press - pressTarget) > 0.004) moving = true;

  field.speed *= Math.exp(-dt / 140);
  if (field.speed > 0.02) moving = true;
  else field.speed = 0;

  if (field.ring >= 0) {
    field.ring += dt;
    if (field.ring > timing.ring) field.ring = -1;
    else moving = true;
  }
  if (field.tap >= 0) {
    field.tap += dt;
    if (field.tap > timing.tap) field.tap = -1;
    else moving = true;
  }
  if (field.intro >= 0) {
    field.intro += dt;
    if (field.intro > timing.introStep * n + 120) field.intro = -1;
    else moving = true;
  }
  return moving;
}

/** Extra lift a passing release wave gives a sentence whose centre is `distance` (canvas units) from the wave's origin. */
export function ringLift(field: Field, distance: number) {
  if (field.ring < 0) return 0;
  const t = field.ring / timing.ring;
  const radius = 0.08 + t * 0.75;
  const amp = 0.38 * (1 - t) * (1 - t);
  const d = (distance - radius) / 0.07;
  return amp * Math.exp(-d * d);
}

/** Record pointer travel since the last event, for the ink a quick sweep throws off. */
export function trackSpeed(field: Field, dx: number, dy: number, dtMs: number) {
  if (dtMs <= 0) return;
  const inst = Math.hypot(dx, dy) / (dtMs / 1000);
  field.speed += (Math.min(inst, 12) - field.speed) * 0.35;
}
