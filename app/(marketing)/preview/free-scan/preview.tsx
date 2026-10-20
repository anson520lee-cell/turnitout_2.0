"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/section";
import { QuickScan } from "@/components/scan/quick-scan";
import { splitSentences } from "@/lib/recheck";
import { isStandout, standoutShare } from "@/lib/scanning/free-range";
import type { RiskLevel, SentenceSignal } from "@/lib/scanning/types";
import { demoText } from "../report-scan/demo";

// Made-up ratings by sentence number (the report-scan preview's), mapped to the free scan's levels.
const FLAGGED: Record<number, RiskLevel> = { 1: "elevated", 2: "elevated", 3: "moderate", 7: "moderate", 10: "moderate", 13: "elevated", 14: "elevated", 15: "elevated", 16: "elevated" };

function demoSentences(): SentenceSignal[] {
  const out: SentenceSignal[] = [];
  let chars = 0;
  for (const [i, x] of splitSentences(demoText).entries()) {
    if (chars > 2000) break;
    chars += x.text.length;
    out.push({ paragraph: x.p - 1, text: x.text, level: FLAGGED[i + 1] ?? "low", reasons: [] });
  }
  return out;
}

export function FreeScanPreview() {
  const [run, setRun] = useState(0);
  const [over, setOver] = useState(false);
  const sentences = useMemo(() => demoSentences(), []);
  const share = standoutShare(sentences) ?? 0;
  return (
    <div className="relative py-16 sm:py-24">
      <Container className="relative max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-subtle hover:text-fg">
          <ArrowLeft className="size-3.5" /> Back home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Free scan · design preview</h1>
        <p className="mt-2 text-[13.5px] text-fg-muted">
          The quick scan a visitor watches after pasting text. Made-up essay and ratings ({sentences.filter((s) => isStandout(s.level)).length} of {sentences.length} sentences stand out, {Math.round(share * 100)}%).
        </p>
        <Button className="mt-5" onClick={() => { setOver(false); setRun((r) => r + 1); }}>
          <Play className="size-4" /> {run ? "Play again" : "Start the scan"}
        </Button>
        {run > 0 && !over && <QuickScan key={run} sentences={sentences} level="elevated" onDone={() => setOver(true)} />}
      </Container>
    </div>
  );
}
