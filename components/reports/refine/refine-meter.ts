/**
 * The AI rate during a live rewrite, as a ticking series. It starts on the report's own score. On a real order
 * (`real`) it follows the live show up and down (refine-script.ts liveAt, landLevels): falling with each rewritten
 * sentence, wobbling like a share price, then walking to each round's re-checked score, and it settles on the best
 * round's real score (Neo, 2026-10-31). In
 * the design previews it follows the projection down in even steps instead (see projectedAt): part of each counted
 * sentence's step as R1 erases it, the rest as R2 types its suggestion. A faint tremor keeps the line alive while it
 * works. When the rewrite is over it settles exactly on the final figure and stops.
 *
 * Kept outside React like the report scan's RateMeter: it ticks 20 times a second and its readers (the number and
 * the chart) draw themselves when it changes.
 */

export interface RefineMeterInput {
  /** False until the live rewrite starts. */
  ready: boolean;
  /** The rate now: the live show (`real`), else the projection. */
  target: number;
  /** A real order: the target is followed up or down. */
  real?: boolean;
  /** The report's own score. */
  original: number;
  /** Steps taken so far (counted sentences rewritten, then each step to a re-checked score): each marks the change since the last. */
  marks: number;
  done: boolean;
  reduce: boolean;
}

export interface RefinePoint {
  t: number;
  v: number;
}

/** The change at a step (a drop, or a rise when a re-check scores higher), for the chart's flash and label. */
export interface RefineDrop {
  t: number;
  from: number;
  to: number;
}

const POINT_MS = 100;
const KEEP = 900;

const gauss = () => {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

export class RefineMeter {
  points: RefinePoint[] = [];
  /** The value shown now, or null before the rewrite starts. */
  cur: number | null = null;
  original = 0;
  target = 0;
  drops: RefineDrop[] = [];
  settled = false;
  settledAt: number | null = null;
  /** The level under the tremor: it glides after the target. */
  level = 0;
  private marks = 0;
  private markedAt: number | null = null;
  private noise = 0;
  private lastPoint = 0;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  step(input: RefineMeterInput, now: number) {
    if (this.settled || !input.ready) return;
    if (this.cur === null) {
      this.level = input.original;
      this.original = input.original;
      this.target = input.target;
      this.lastPoint = now - POINT_MS;
    }
    if (input.marks > this.marks) {
      const at = input.real ? input.target : (this.cur ?? this.level);
      const from = this.markedAt ?? input.original;
      if (Math.abs(from - at) > 0.0005) this.drops.push({ t: now, from, to: at });
      if (this.drops.length > 40) this.drops.shift();
      this.marks = input.marks;
      this.markedAt = at;
    }
    // A projection only ever goes down while it works (an estimate can rise a little when a sentence turns out kept);
    // the live show is followed up and down, and at the end the final figure.
    this.target = input.done || input.real ? input.target : Math.min(this.target, input.target);
    this.level = input.reduce ? this.target : this.level + (this.target - this.level) * (input.done ? 0.3 : 0.16);
    this.noise = input.done ? this.noise * 0.5 : this.noise * 0.85 + (input.reduce ? 0 : 0.0012) * gauss();
    if (input.done && Math.abs(this.level - input.target) < 0.0004 && Math.abs(this.noise) < 0.0004) {
      this.level = input.target;
      this.noise = 0;
      this.settled = true;
      this.settledAt = now;
    }
    const v = Math.max(0, Math.min(1, this.level + this.noise));
    this.cur = v;
    if (now - this.lastPoint >= POINT_MS || this.settled) {
      this.points.push({ t: now, v });
      if (this.points.length > KEEP) this.points.splice(0, this.points.length - KEEP);
      this.lastPoint = now;
    }
    this.listeners.forEach((fn) => fn());
  }
}

export const REFINE_POINT_MS = POINT_MS;
