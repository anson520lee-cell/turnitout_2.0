import { MAX_ROUNDS } from "@/lib/auto-report/rewrite";

/** ?recheck=98,97,60: the made-up score of each round, in percent (at most MAX_ROUNDS), or null for none. */
export function recheckScores(param: string | undefined): number[] | null {
  if (!param) return null;
  const scores = param
    .split(",")
    .filter((x) => x.trim())
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x))
    .map((x) => Math.min(100, Math.max(0, x)))
    .slice(0, MAX_ROUNDS);
  return scores.length ? scores : null;
}
