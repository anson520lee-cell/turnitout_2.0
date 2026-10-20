import { ReportScanPreview } from "./preview";

/**
 * Design preview of the live report scan, with a made-up essay and made-up
 * ratings. Not part of the product and not linked from navigation.
 * ?speed=4 runs it faster, ?skip=1 skips the opening sequence, ?late=1 makes
 * the "reviewer" answer late (to see the scan wait for it).
 */
export default async function ReportScanPreviewPage({ searchParams }: PageProps<"/preview/report-scan">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const speed = Math.min(20, Math.max(0.25, Number(one(sp.speed)) || 1));
  return <ReportScanPreview speed={speed} skipIntro={one(sp.skip) === "1"} late={one(sp.late) === "1"} />;
}
