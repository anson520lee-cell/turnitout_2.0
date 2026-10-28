import { RefineScanPreview } from "./preview";

/**
 * Design preview of the live rewrite (Writing Refinement), with a made-up essay, made-up ratings and made-up
 * suggestions. Not part of the product and not linked from navigation. ?speed=4 runs it faster, ?skip=1 skips the
 * opening sequence, ?late=1 makes the first suggestions arrive late (to see the rewrite catch up with the reader),
 * ?recheck=97 ends on a made-up re-check of the rewritten text at that score instead of the projection.
 */
export default async function RefineScanPreviewPage({ searchParams }: PageProps<"/preview/refine-scan">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const speed = Math.min(20, Math.max(0.25, Number(one(sp.speed)) || 1));
  const recheck = one(sp.recheck) ? Math.min(100, Math.max(0, Number(one(sp.recheck)) || 0)) : null;
  return <RefineScanPreview speed={speed} skipIntro={one(sp.skip) === "1"} late={one(sp.late) === "1"} recheck={recheck} />;
}
