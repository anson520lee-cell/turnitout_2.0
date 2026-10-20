/**
 * The live AI rate as a ticking series, like a share price. Its level always
 * follows the real estimate (the share of the sentences shown so far that the
 * report flags, see `liveEstimate`); on top of that it carries a small jitter
 * that fades to nothing by the end, so it never looks frozen. When the scan
 * is done it settles exactly on the report's own figure and stops.
 *
 * Kept outside React: it ticks 20 times a second and its readers (the number
 * and the charts) draw themselves when it changes.
 */

export interface MeterInput {
  /** False until the first sentence's rating is shown. */
  ready: boolean;
  /** The real estimate now. */
  base: number;
  /** How far through the text, 0 to 1 (the jitter fades with it). */
  progress: number;
  done: boolean;
  /** The report's figure. */
  final: number;
  reduce: boolean;
}

export interface MeterPoint {
  t: number;
  v: number;
  /** How much the value moved since the previous point (the "volume" bar). */
  vol: number;
  up: boolean;
}

const POINT_MS = 200;
const KEEP = 600;

const gauss = () => {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

export class RateMeter {
  points: MeterPoint[] = [];
  /** The value shown now, or null before the first rating. */
  cur: number | null = null;
  /** First, highest and lowest real estimate so far (no jitter). */
  open: number | null = null;
  hi = 0;
  lo = 1;
  settled = false;
  settledAt: number | null = null;
  private x = 0;
  private noise = 0;
  private moved = 0;
  private lastPoint = 0;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** The value about `ms` ago, for the change shown next to the number. */
  ago(ms: number, now: number): number | null {
    for (let i = this.points.length - 1; i >= 0; i--) if (now - this.points[i].t >= ms) return this.points[i].v;
    return this.points[0]?.v ?? null;
  }

  step(input: MeterInput, now: number) {
    if (this.settled || !input.ready) return;
    if (this.cur === null) {
      this.x = input.base;
      this.open = input.base;
      this.lastPoint = now - POINT_MS;
    }
    this.hi = Math.max(this.hi, input.base);
    this.lo = Math.min(this.lo, input.base);
    if (input.done) {
      this.x += (input.final - this.x) * 0.3;
      this.noise *= 0.5;
      if (Math.abs(this.x - input.final) < 0.0004 && Math.abs(this.noise) < 0.0004) {
        this.x = input.final;
        this.noise = 0;
        this.settled = true;
        this.settledAt = now;
      }
    } else {
      this.x += (input.base - this.x) * 0.2;
      const sigma = input.reduce ? 0 : 0.004 * Math.pow(1 - Math.min(1, input.progress), 1.4) + 0.0003;
      this.noise = this.noise * 0.86 + sigma * gauss();
    }
    const v = Math.max(0, Math.min(1, this.x + this.noise));
    if (this.cur !== null) this.moved += Math.abs(v - this.cur);
    this.cur = v;
    if (now - this.lastPoint >= POINT_MS || this.settled) {
      const prev = this.points[this.points.length - 1];
      this.points.push({ t: now, v, vol: this.moved, up: prev ? v >= prev.v : true });
      if (this.points.length > KEEP) this.points.splice(0, this.points.length - KEEP);
      this.moved = 0;
      this.lastPoint = now;
    }
    this.listeners.forEach((fn) => fn());
  }
}

export const METER_POINT_MS = POINT_MS;
