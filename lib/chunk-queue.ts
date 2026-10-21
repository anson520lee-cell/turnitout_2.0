/** Most model calls the background backtest may make in 24 hours, across all queued runs (about US$15; raised from 400 to 1,000 on 2026-10-20 and to 2,000 on 2026-10-21 for the big human and AI sample sets). */
export const DAILY_PIECE_CAP = 2000;

/** How many more model calls a queued run may make now: its own cap and the daily cap, whichever is lower. */
export function pieceBudget(args: { maxPieces: number; attempted: number; usedLast24h: number; cap?: number }): number {
  const { maxPieces, attempted, usedLast24h, cap = DAILY_PIECE_CAP } = args;
  return Math.max(0, Math.min(maxPieces - attempted, cap - usedLast24h));
}
