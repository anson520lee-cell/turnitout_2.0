"use client";
import { DepthLayer, DepthStage } from "./depth-stage";
import { cn } from "@/lib/utils";
import { GreekText } from "@/components/landing/greek-text";
import { CODE } from "@/lib/greek-decode";
import { AgentTerminal } from "@/components/landing/agent-terminal";

/**
 * Illustrations for the report and refinement request pages. They show what
 * is delivered, not values, so nothing here can be mistaken for a real
 * screening outcome.
 */

const NONE: number[] = [];
const DRAFT_LINES = CODE.slice(0, 8);
const REFINED_LINES = CODE.slice(3, 11);
const REFINED_FLAGGED = [1, 6];

export { ReportLiveVisual as ReportVisual } from "./report-live-visual";

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
