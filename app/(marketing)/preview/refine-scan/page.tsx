import { RefineScanPreview } from "./preview";
import { liveScores, recheckScores } from "./recheck";

/**
 * Design preview of the live rewrite (Writing Refinement), with a made-up essay, made-up ratings and made-up
 * suggestions. Not part of the product and not linked from navigation. ?speed=4 runs it faster, ?skip=1 skips the
 * opening sequence, ?late=1 makes the first suggestions arrive late (to see the rewrite catch up with the reader),
 * ?recheck=98,97,60 runs a made-up re-check of the rewritten text instead of the projection, one round per score
 * (?recheck=97 for a single round), and ends on the lowest. With ?recheck, ?live=80,72,60 also lands made-up live
 * scores of the text so far on the rate, one after another, before the first re-check is in.
 */
export default async function RefineScanPreviewPage({ searchParams }: PageProps<"/preview/refine-scan">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const speed = Math.min(20, Math.max(0.25, Number(one(sp.speed)) || 1));
  const recheck = recheckScores(one(sp.recheck));
  return <RefineScanPreview speed={speed} skipIntro={one(sp.skip) === "1"} late={one(sp.late) === "1"} recheck={recheck} live={liveScores(one(sp.live))} />;
}
