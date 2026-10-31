import { RefineScanPreview } from "../refine-scan/preview";
import { recheckScores } from "../refine-scan/recheck";

/**
 * Design preview of the live rewrite (Writing Refinement) on a made-up essay rated AI in every sentence, so the
 * rate starts at 100%. Not part of the product and not linked from navigation. Same options as /preview/refine-scan:
 * ?speed=4 runs it faster, ?skip=1 skips the opening sequence, ?late=1 makes the first suggestions arrive late,
 * ?recheck=98,97,60 runs a made-up re-check, one round per score, and ends on the lowest.
 */
export default async function Refine100PreviewPage({ searchParams }: PageProps<"/preview/refine-100">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const speed = Math.min(20, Math.max(0.25, Number(one(sp.speed)) || 1));
  const recheck = recheckScores(one(sp.recheck));
  return <RefineScanPreview essay="ai100" speed={speed} skipIntro={one(sp.skip) === "1"} late={one(sp.late) === "1"} recheck={recheck} />;
}
