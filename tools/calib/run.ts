import { HeuristicWritingAnalyzer } from "../../lib/scanning/heuristic-analyzer";
import { samples } from "./samples";
(async () => {
  const a = new HeuristicWritingAnalyzer();
  for (const [name, s] of Object.entries(samples)) {
    const r = await a.analyze(s.text);
    const sig = r.signals.map((x) => `${x.id.slice(0, 4)}=${x.score ?? "-"}`).join(" ");
    console.log(`${s.kind.padEnd(5)} ${name.padEnd(26)} words=${String(r.metadata.words).padStart(3)} overall=${r.overallRisk.padEnd(8)} | ${sig}`);
  }
})();
