/**
 * Back-test of the free scan: runs a folder of labelled text sets through the
 * analyzer and prints how often each set lands on each level.
 *   npx tsx tools/calib/backtest.ts <dir with *.json files: [{text, ...}]>
 * File names starting with "human" are treated as human-written, "ai" as AI.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HeuristicWritingAnalyzer } from "../../lib/scanning/heuristic-analyzer";

(async () => {
  const dir = process.argv[2];
  const limit = Number(process.argv[3] ?? 100000);
  const a = new HeuristicWritingAnalyzer();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const items: { text: string }[] = JSON.parse(readFileSync(join(dir, f), "utf8")).slice(0, limit);
    const c = { low: 0, moderate: 0, elevated: 0 };
    const sig: Record<string, number[]> = {};
    for (const it of items) {
      const r = await a.analyze(it.text);
      c[r.overallRisk]++;
      for (const s of r.signals) if (s.score !== null) (sig[s.id] ??= []).push(s.score);
    }
    const n = items.length;
    const pct = (x: number) => ((100 * x) / n).toFixed(1).padStart(5) + "%";
    const mean = (xs: number[]) => (xs.reduce((p, q) => p + q, 0) / Math.max(xs.length, 1)).toFixed(0);
    console.log(
      `${f.padEnd(22)} n=${String(n).padStart(5)}  low ${pct(c.low)}  moderate ${pct(c.moderate)}  elevated ${pct(c.elevated)} | mean signal: ` +
        Object.entries(sig).map(([k, v]) => `${k.slice(0, 5)}=${mean(v)}`).join(" "),
    );
  }
})();
