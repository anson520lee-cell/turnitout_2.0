"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/section";
import { RefineScan } from "@/components/reports/refine/refine-scan";
import type { AutoReportResult } from "@/lib/auto-report/stitch";
import type { ReportRewrite, RewriteItem } from "@/lib/auto-report/rewrite";
import { refineDemoResult, refineDemoRewrite } from "./demo";
import { ai100Result, ai100Rewrite } from "../refine-100/demo";

export type RefineEssay = "urban" | "ai100";

const ESSAYS: Record<RefineEssay, { result: () => AutoReportResult; rewrite: (r: AutoReportResult) => ReportRewrite; title: string; heading: string; blurb: string }> = {
  urban: {
    result: refineDemoResult,
    rewrite: refineDemoRewrite,
    title: "Example: Urban transport essay",
    heading: "Live rewrite · design preview",
    blurb: "What a customer sees while Writing Refinement writes their suggestions. This preview uses a made-up essay, made-up ratings and made-up suggestions; on a real order they come from the real report and the real writer.",
  },
  ai100: {
    result: ai100Result,
    rewrite: ai100Rewrite,
    title: "Example: Technology in education essay",
    heading: "Live rewrite · 100% AI essay",
    blurb: "Writing Refinement on an essay that reads as AI in every sentence, so the rate starts at 100% and falls as each sentence is rewritten. Made-up essay, ratings and suggestions; five suggestions fail the checks on purpose, so those sentences stay as written and the rate ends on the real projection.",
  },
};

export function RefineScanPreview({ speed, skipIntro, late, essay = "urban" }: { speed: number; skipIntro: boolean; late: boolean; essay?: RefineEssay }) {
  const copy = ESSAYS[essay];
  const [run, setRun] = useState(1);
  const [over, setOver] = useState(false);
  return (
    <div className="relative py-16 sm:py-24">
      <Container className="relative max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-subtle hover:text-fg">
          <ArrowLeft className="size-3.5" /> Back home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{copy.heading}</h1>
        <p className="mt-2 text-[13.5px] text-fg-muted">{copy.blurb}</p>
        <Card strong className="noise mt-6 p-5 sm:p-7">
          {over ? (
            <div className="text-center">
              <p className="text-[14px] text-fg-muted">The rewrite ended here; on a real order the suggestions open now, to accept one by one.</p>
              <Button className="mt-4" onClick={() => { setOver(false); setRun((r) => r + 1); }}>
                <Play className="size-4" /> Play again
              </Button>
            </div>
          ) : (
            <Demo key={run} essay={essay} speed={speed} skipIntro={skipIntro} late={late} onFinish={() => setOver(true)} />
          )}
        </Card>
      </Container>
    </div>
  );
}

function Demo({ essay, speed, skipIntro, late, onFinish }: { essay: RefineEssay; speed: number; skipIntro: boolean; late: boolean; onFinish: () => void }) {
  const copy = ESSAYS[essay];
  const result = useMemo(() => copy.result(), [copy]);
  // Like the real writer: batches of six asked at once, each answering sentence by sentence once it starts writing
  // (first answers after about 5 s; ?late=1 after about 25 s), then the whole rewrite with the kept ones.
  const [arrived, setArrived] = useState<RewriteItem[]>([]);
  const [rewrite, setRewrite] = useState<ReportRewrite | null>(null);
  useEffect(() => {
    const full = copy.rewrite(result);
    const base = late ? 25_000 : 5_000;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let last = base;
    full.items.forEach((item, k) => {
      if (!item.rewrite) return;
      const at = base + Math.floor(k / 6) * 900 + (k % 6) * 2_400;
      last = Math.max(last, at);
      timers.push(setTimeout(() => setArrived((a) => [...a, item]), at / speed));
    });
    timers.push(setTimeout(() => setRewrite(full), (last + 1_500) / speed));
    return () => timers.forEach(clearTimeout);
  }, [copy, result, late, speed]);
  return <RefineScan result={result} rewrite={rewrite} arrived={arrived} title={copy.title} reference="Preview session" onFinish={onFinish} speed={speed} skipIntro={skipIntro} />;
}
