/** Most model calls the background backtest may make in 24 hours, across all queued runs (about US$7.5; raised from 400 on 2026-10-20 to get through the big sample set). */
export const DAILY_PIECE_CAP = 1000;

/** How many more model calls a queued run may make now: its own cap and the daily cap, whichever is lower. */
export function pieceBudget(args: { maxPieces: number; attempted: number; usedLast24h: number; cap?: number }): number {
  const { maxPieces, attempted, usedLast24h, cap = DAILY_PIECE_CAP } = args;
  return Math.max(0, Math.min(maxPieces - attempted, cap - usedLast24h));
}
