"use client";
import { FileText } from "lucide-react";
import { DepthLayer, DepthStage } from "./depth-stage";
import { cn } from "@/lib/utils";
import { GreekText } from "@/components/landing/greek-text";
import { CODE } from "@/lib/greek-decode";
import { AgentTerminal } from "@/components/landing/agent-terminal";

/**
 * Illustrations for the report and refinement request pages: the paper stack
 * with the agent console under it (the same console as the scan page), no
 * labels floating over the documents. They show what is delivered, not
 * values, so nothing here can be mistaken for a real screening outcome.
 */

const NONE: number[] = [];
const MAIN_LINES = CODE.slice(0, 13);
const MAIN_FLAGGED = [7, 9];
const BACK_LINES = CODE.slice(3, 11);
const DRAFT_LINES = CODE.slice(0, 8);
const REFINED_LINES = CODE.slice(3, 11);
const REFINED_FLAGGED = [1, 6];

export function ReportVisual({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <DepthStage className="relative min-h-[220px] w-full flex-1" tilt={16}>
        {/* back sheet */}
        <DepthLayer depth={-40} className="left-[24%] top-[6%] h-[82%] w-[48%] rotate-[-7deg]">
          <div className="glass relative size-full rounded-2xl p-4 opacity-70">
            <div className="absolute inset-4">
              <GreekText lines={BACK_LINES} flagged={NONE} beam={false} maxChars={24} />
            </div>
          </div>
        </DepthLayer>
        {/* main document */}
        <DepthLayer depth={10} className="left-[28%] top-[4%] h-[86%] w-[48%]">
          <div className="glass-strong noise relative size-full overflow-hidden rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-accent" />
              <div className="h-2 w-24 rounded-full bg-[#c6d3ff]/35" />
            </div>
            <div className="absolute inset-x-5 bottom-5 top-[60px]">
              <GreekText lines={MAIN_LINES} flagged={MAIN_FLAGGED} maxChars={30} caption />
            </div>
          </div>
        </DepthLayer>
      </DepthStage>
      <AgentTerminal />
    </div>
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
