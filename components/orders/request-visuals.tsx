"use client";
import { Check, FileText, PenLine, ScanSearch, Sparkles } from "lucide-react";
import { DepthLayer, DepthStage } from "./depth-stage";
import { cn } from "@/lib/utils";
import { GreekText } from "@/components/landing/greek-text";
import { CODE } from "@/lib/greek-decode";

/**
 * Illustrations for the report and refinement request pages. They show what
 * is delivered (which parts, not values): no percentages or sample results,
 * so nothing here can be mistaken for a real screening outcome.
 */

const NONE: number[] = [];
const MAIN_LINES = CODE.slice(0, 13);
const MAIN_FLAGGED = [7, 9];
const BACK_LINES = CODE.slice(3, 11);
const DRAFT_LINES = CODE.slice(0, 8);
const REFINED_LINES = CODE.slice(3, 11);
const REFINED_FLAGGED = [1, 6];

function Chip({ icon: Icon, label, tone }: { icon: typeof Sparkles; label: string; tone: "accent" | "violet" | "cyan" | "ok" }) {
  return (
    <div className="glass-strong flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-medium shadow-[0_18px_40px_-18px_rgb(0_0_0/0.9)]">
      <span
        className={cn(
          "grid size-7 place-items-center rounded-lg",
          tone === "accent" && "bg-accent/15 text-accent",
          tone === "violet" && "bg-violet/15 text-violet",
          tone === "cyan" && "bg-cyan/15 text-cyan",
          tone === "ok" && "bg-ok/15 text-ok",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      {label}
    </div>
  );
}

/** Rings drawn empty on purpose: the report fills in real values, the illustration never does. */
function EmptyRing({ className, hue }: { className?: string; hue: string }) {
  return (
    <svg viewBox="0 0 44 44" className={className}>
      <circle cx="22" cy="22" r="18" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="4" />
      <circle
        cx="22"
        cy="22"
        r="18"
        fill="none"
        stroke={hue}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="10 103"
        className="origin-center motion-safe:animate-[spin_3.2s_linear_infinite]"
      />
    </svg>
  );
}

export function ReportVisual({ className }: { className?: string }) {
  return (
    <DepthStage className={cn("w-full", className)} tilt={16}>
      {/* back sheet */}
      <DepthLayer depth={-40} className="left-[14%] top-[6%] h-[82%] w-[56%] rotate-[-7deg]">
        <div className="glass relative size-full rounded-2xl p-4 opacity-70">
          <div className="absolute inset-4">
            <GreekText lines={BACK_LINES} flagged={NONE} beam={false} maxChars={24} />
          </div>
        </div>
      </DepthLayer>
      {/* main document */}
      <DepthLayer depth={10} className="left-[24%] top-[4%] h-[86%] w-[54%]">
        <div className="glass-strong noise relative size-full overflow-hidden rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-accent" />
            <div className="h-2 w-24 rounded-full bg-[#c6d3ff]/35" />
          </div>
          <div className="absolute inset-x-5 bottom-5 top-[60px]">
            <GreekText lines={MAIN_LINES} flagged={MAIN_FLAGGED} maxChars={30} />
          </div>
        </div>
      </DepthLayer>
      {/* what the report contains */}
      <DepthLayer depth={70} drift={10} className="left-[2%] top-[18%]">
        <div className="glass-strong flex items-center gap-3 rounded-2xl px-3.5 py-3 shadow-[0_24px_50px_-20px_rgb(0_0_0/0.9)]">
          <EmptyRing className="size-9" hue="#5b8cff" />
          <div>
            <p className="text-[12px] font-semibold">AI-writing indicator</p>
            <p className="text-[10.5px] text-fg-subtle">as returned</p>
          </div>
        </div>
      </DepthLayer>
      <DepthLayer depth={95} drift={14} className="right-[1%] top-[40%]">
        <div className="glass-strong flex items-center gap-3 rounded-2xl px-3.5 py-3 shadow-[0_24px_50px_-20px_rgb(0_0_0/0.9)]">
          <EmptyRing className="size-9" hue="#9a7bff" />
          <div>
            <p className="text-[12px] font-semibold">Similarity</p>
            <p className="text-[10.5px] text-fg-subtle">as returned</p>
          </div>
        </div>
      </DepthLayer>
      <DepthLayer depth={60} drift={8} className="bottom-[4%] left-[10%]">
        <Chip icon={ScanSearch} label="Report file · PDF where available" tone="cyan" />
      </DepthLayer>
    </DepthStage>
  );
}

export function RefinementVisual({ className }: { className?: string }) {
  return (
    <DepthStage className={cn("w-full", className)} tilt={14}>
      {/* your draft */}
      <DepthLayer depth={-30} className="left-[6%] top-[8%] h-[76%] w-[50%] rotate-[-5deg]">
        <div className="glass relative size-full rounded-2xl p-4">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-fg-subtle">Your draft</p>
          <div className="absolute inset-x-4 bottom-4 top-10">
            <GreekText lines={DRAFT_LINES} flagged={NONE} beam={false} maxChars={22} />
          </div>
        </div>
      </DepthLayer>
      {/* refined */}
      <DepthLayer depth={40} className="right-[6%] top-[14%] h-[76%] w-[52%]">
        <div className="glass-strong noise relative size-full overflow-hidden rounded-2xl p-4">
          <div aria-hidden className="absolute -right-10 -top-10 size-32 rounded-full bg-violet/25 blur-2xl" />
          <p className="relative font-mono text-[9.5px] uppercase tracking-[0.18em] text-violet">Refined</p>
          <div className="absolute inset-x-4 bottom-4 top-10">
            <GreekText lines={REFINED_LINES} flagged={REFINED_FLAGGED} maxChars={22} />
          </div>
        </div>
      </DepthLayer>
      <DepthLayer depth={90} drift={12} className="left-[36%] top-[2%]">
        <div className="glass-strong grid size-12 place-items-center rounded-2xl text-violet shadow-[0_20px_40px_-16px_rgb(154_123_255/0.6)]">
          <PenLine className="size-5" />
        </div>
      </DepthLayer>
      <DepthLayer depth={75} drift={10} className="bottom-[2%] left-[2%]">
        <Chip icon={Check} label="Meaning & citations kept" tone="ok" />
      </DepthLayer>
      <DepthLayer depth={105} drift={14} className="bottom-[12%] right-[0%]">
        <Chip icon={Sparkles} label="Clarity · flow · style" tone="violet" />
      </DepthLayer>
    </DepthStage>
  );
}
