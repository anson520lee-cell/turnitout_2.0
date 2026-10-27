/**
 * The projected AI rate during a live rewrite, as a ticking series. It starts on the report's own score and follows
 * the rewrite down smoothly (see projectedAt): a share of each counted sentence's drop as R1 encodes it, the rest
 * as its suggestion is typed. A faint tremor keeps the line alive while it works. When the rewrite is over it
 * settles exactly on the projected figure and stops.
 *
 * Kept outside React like the report scan's RateMeter: it ticks 20 times a second and its readers (the number and
 * the chart) draw themselves when it changes.
 */

export interface RefineMeterInput {
  /** False until the live rewrite starts. */
  ready: boolean;
  /** The projected rate now. */
  target: number;
  /** The report's own score. */
  original: number;
  /** Steps so far (a counted sentence encoded, or its suggestion typed): each one marks the drop since the last. */
  marks: number;
  done: boolean;
  reduce: boolean;
}

export interface RefinePoint {
  t: number;
  v: number;
}

/** The drop since the previous step, for the chart's flash and label. */
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
      const at = this.cur ?? this.level;
      const from = this.markedAt ?? input.original;
      if (from - at > 0.0005) this.drops.push({ t: now, from, to: at });
      if (this.drops.length > 40) this.drops.shift();
      this.marks = input.marks;
      this.markedAt = at;
    }
    this.target = input.target;
    this.level = input.reduce ? input.target : this.level + (input.target - this.level) * (input.done ? 0.3 : 0.16);
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
