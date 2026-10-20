"use client";
import { Download, FileText } from "lucide-react";
import { DepthLayer, DepthStage } from "./depth-stage";
import { cn } from "@/lib/utils";
import { GreekText } from "@/components/landing/greek-text";
import { CODE } from "@/lib/greek-decode";
import { AgentTerminal } from "@/components/landing/agent-terminal";
import { RiskGauge } from "@/components/scan/risk-gauge";

/**
 * Illustrations for the report and refinement request pages. They show what
 * is delivered, not values, so nothing here can be mistaken for a real
 * screening outcome.
 */

const NONE: number[] = [];
const DRAFT_LINES = CODE.slice(0, 8);
const REFINED_LINES = CODE.slice(3, 11);
const REFINED_FLAGGED = [1, 6];

/** A made-up sample, so the picture shows the shape of a report and not a result. */
const MAP: Array<"low" | "medium" | "high"> = [
  "low", "low", "medium", "low", "low", "high", "high", "medium", "low", "low", "low", "medium",
  "low", "low", "low", "medium", "high", "medium", "low", "low", "low", "low", "medium", "low",
];
const MAP_COLOR = { low: "bg-ok/35", medium: "bg-warn/70", high: "bg-risk/85" } as const;

function Stat({ label, value, of }: { label: string; value: string; of?: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-ink-900/50 px-3 py-2">
      <p className="text-[10.5px] text-fg-subtle">{label}</p>
      <p className="mt-0.5 text-[17px] font-semibold leading-none tracking-tight">
        {value}
        {of && <span className="ml-1 text-[10.5px] font-normal text-fg-subtle">{of}</span>}
      </p>
    </div>
  );
}

/**
 * The report request page's illustration: a small replica of the finished
 * report (overall level, text map, marked sentences) floating in 3D, with a
 * sentence note and a PDF tag at different depths. All values are a sample.
 */
export function ReportVisual({ className }: { className?: string }) {
  return (
    <DepthStage className={cn("relative w-full", className)} tilt={10}>
      <DepthLayer depth={0} className="inset-x-0 top-0 sm:inset-x-[3%]">
        <div className="glass-strong noise relative overflow-hidden rounded-2xl">
          <div aria-hidden className="absolute -right-16 -top-20 size-56 rounded-full bg-accent/20 blur-3xl" />
          <div aria-hidden className="absolute -bottom-24 -left-10 size-56 rounded-full bg-violet/15 blur-3xl" />
          <div aria-hidden className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(70%_70%_at_50%_30%,black,transparent)]" />

          {/* window bar */}
          <div className="relative flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-2.5">
            <span className="grid size-6 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent">
              <FileText className="size-3.5" />
            </span>
            <span className="text-[12.5px] font-medium">AI-Writing Risk Report</span>
            <span className="rounded-full border border-violet/30 bg-violet/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#c7b8ff]">
              Sample
            </span>
            <span className="ml-auto hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ok sm:flex">
              <span className="size-1.5 rounded-full bg-ok shadow-[0_0_8px_2px_rgb(79_209_165/0.6)]" /> Complete
            </span>
          </div>

          <div className="relative grid gap-4 p-4 sm:grid-cols-[170px_1fr] sm:gap-5 sm:p-5 sm:pb-24">
            {/* overall level */}
            <div className="flex items-center gap-3 sm:flex-col sm:items-stretch">
              <div className="w-[150px] shrink-0 sm:w-full">
                <RiskGauge level="moderate" />
              </div>
              <div className="grid flex-1 grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex-none">
                <Stat label="Sentences marked" value="9" of="of 41" />
                <Stat label="Paragraphs at risk" value="3" of="of 8" />
              </div>
            </div>

            {/* text map + marked sentences */}
            <div className="min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">Text map</p>
                <p className="flex items-center gap-2.5 text-[10px] text-fg-subtle">
                  {([["bg-ok/50", "Low"], ["bg-warn", "Medium"], ["bg-risk", "High"]] as const).map(([c, t]) => (
                    <span key={t} className="flex items-center gap-1">
                      <span className={cn("size-1.5 rounded-full", c)} /> {t}
                    </span>
                  ))}
                </p>
              </div>
              <div className="relative mt-2 flex h-9 gap-[3px] overflow-hidden rounded-md">
                {MAP.map((r, i) => (
                  <span key={i} className={cn("flex-1 rounded-[3px]", MAP_COLOR[r])} />
                ))}
                <span aria-hidden className="report-sweep pointer-events-none absolute inset-y-0 left-0 w-[14%] bg-gradient-to-r from-transparent via-white/45 to-transparent" />
              </div>

              <div className="mt-4 rounded-xl border border-[var(--line)] bg-ink-900/50 p-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">Paragraph 4 · Medium risk</p>
                <p className="mt-2 text-[12.5px] leading-[1.7] text-fg-muted">
                  City planners have long argued about street design.{" "}
                  <span className="rounded-[3px] bg-risk/20 px-0.5 text-fg underline decoration-risk/70 decoration-2 underline-offset-[3px]">
                    In today&apos;s fast-changing world, it is important to note that transport plays a crucial role.
                  </span>{" "}
                  On my own street, the new bus lane changed very little.{" "}
                  <span className="rounded-[3px] bg-warn/20 px-0.5 underline decoration-warn/70 underline-offset-[3px]">
                    Overall, a balanced approach is essential.
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </DepthLayer>

      {/* floating pieces at different depths */}
      <DepthLayer depth={70} drift={10} className="bottom-0 right-2 hidden sm:block">
        <div className="glass-strong max-w-[230px] rounded-xl border-risk/25 p-3 shadow-[0_18px_40px_-14px_rgb(0_0_0/0.8),0_0_30px_-8px_rgb(255_122_138/0.35)]">
          <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-risk">
            <span className="size-1.5 rounded-full bg-risk shadow-[0_0_8px_2px_rgb(255_122_138/0.6)]" /> Sentence 2 · High
          </p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-fg-muted">Stock opening phrase.</p>
          <p className="mt-1 text-[11.5px] leading-snug text-[#a9c1ff]">
            <span className="mr-1 font-mono text-[9px] uppercase tracking-wider text-fg-subtle">Ask yourself</span>
            What did you actually see or do here?
          </p>
        </div>
      </DepthLayer>
      <DepthLayer depth={50} drift={8} className="bottom-3 left-6 hidden sm:block">
        <div className="glass-strong flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] font-medium">
          <Download className="size-3.5 text-accent" /> PDF download
        </div>
      </DepthLayer>
    </DepthStage>
  );
}

export function RefinementVisual({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <DepthStage className="relative min-h-[220px] w-full flex-1" tilt={14}>
        {/* your draft */}
        <DepthLayer depth={-30} className="left-[10%] top-[8%] h-[80%] w-[40%] rotate-[-5deg]">
          <div className="glass relative size-full rounded-2xl p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">Your draft</p>
            <div className="absolute inset-x-4 bottom-4 top-10">
              <GreekText lines={DRAFT_LINES} flagged={NONE} beam={false} maxChars={22} />
            </div>
          </div>
        </DepthLayer>
        {/* refined */}
        <DepthLayer depth={40} className="right-[10%] top-[12%] h-[80%] w-[42%]">
          <div className="glass-strong noise relative size-full overflow-hidden rounded-2xl p-4">
            <div aria-hidden className="absolute -right-10 -top-10 size-32 rounded-full bg-violet/25 blur-2xl" />
            <p className="relative font-mono text-[11px] uppercase tracking-[0.18em] text-violet">Refined</p>
            <div className="absolute inset-x-4 bottom-4 top-10">
              <GreekText lines={REFINED_LINES} flagged={REFINED_FLAGGED} maxChars={22} />
            </div>
          </div>
        </DepthLayer>
      </DepthStage>
      <AgentTerminal />
    </div>
  );
}
