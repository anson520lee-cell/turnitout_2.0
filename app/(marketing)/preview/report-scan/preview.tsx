"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/section";
import { ReportScan } from "@/components/reports/scan/report-scan";
import { useDemoReportFeed } from "@/components/reports/scan/use-report-feed";
import { demoResult, demoText } from "./demo";

export function ReportScanPreview({ speed, skipIntro, late }: { speed: number; skipIntro: boolean; late: boolean }) {
  const [run, setRun] = useState(1);
  const [over, setOver] = useState(false);
  return (
    <div className="relative py-16 sm:py-24">
      <Container className="relative max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-subtle hover:text-fg">
          <ArrowLeft className="size-3.5" /> Back home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Live report scan · design preview</h1>
        <p className="mt-2 text-[13.5px] text-fg-muted">
          What a customer sees after paying for a report. This preview uses a made-up essay and made-up ratings; on a real order the ratings come from the real report.
        </p>
        <Card strong className="noise mt-6 p-5 sm:p-7">
          {over ? (
            <div className="text-center">
              <p className="text-[14px] text-fg-muted">The scan ended here; on a real order the full report opens now.</p>
              <Button className="mt-4" onClick={() => { setOver(false); setRun((r) => r + 1); }}>
                <Play className="size-4" /> Play again
              </Button>
            </div>
          ) : (
            <Demo key={run} speed={speed} skipIntro={skipIntro} late={late} onFinish={() => setOver(true)} />
          )}
        </Card>
      </Container>
    </div>
  );
}

function Demo({ speed, skipIntro, late, onFinish }: { speed: number; skipIntro: boolean; late: boolean; onFinish: () => void }) {
  const result = useMemo(() => demoResult(), []);
  // The real reviewer usually answers within the opening sequence; ?late=1 shows the scan waiting for it.
  const feed = useDemoReportFeed(result, (late ? 70_000 : 9_000) / speed);
  return <ReportScan text={demoText} feed={feed} title="Example: Urban transport essay" reference="Preview session" onFinish={onFinish} speed={speed} skipIntro={skipIntro} />;
}
