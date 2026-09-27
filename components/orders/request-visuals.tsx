"use client";
import { Check, FileText, PenLine, ScanSearch, Sparkles } from "lucide-react";
import { DepthLayer, DepthStage } from "./depth-stage";
import { cn } from "@/lib/utils";

/**
 * Illustrations for the report and refinement request pages. They show what
 * is delivered (which parts, not values): no percentages or sample results,
 * so nothing here can be mistaken for a real screening outcome.
 */

function Lines({ widths, accent = [] as number[], className }: { widths: number[]; accent?: number[]; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {widths.map((w, i) =>
        w ? (
          <div
            key={i}
            className={cn("h-[5px] rounded-full", accent.includes(i) ? "bg-gradient-to-r from-violet/80 to-accent/70" : "bg-[#c6d3ff]/20")}
            style={{ width: `${w}%` }}
          />
        ) : (
          <div key={i} className="h-2" />
        ),
      )}
    </div>
  );
}

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
        <div className="glass size-full rounded-2xl p-4 opacity-70">
          <Lines widths={[70, 90, 84, 0, 88, 76, 92, 60]} />
        </div>
      </DepthLayer>
      {/* main document */}
      <DepthLayer depth={10} className="left-[24%] top-[4%] h-[86%] w-[54%]">
        <div className="glass-strong noise relative size-full overflow-hidden rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-accent" />
            <div className="h-2 w-24 rounded-full bg-[#c6d3ff]/35" />
          </div>
          <Lines className="mt-5" widths={[92, 86, 95, 72, 0, 90, 84, 88, 64, 0, 94, 80]} accent={[2, 7]} />
          <div
            className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-transparent via-cyan/15 to-cyan/60 motion-safe:animate-scan [--scan-distance:520%]"
            style={{ boxShadow: "0 12px 30px -8px rgb(95 216 245 / 0.55)" }}
          />
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
        <div className="glass size-full rounded-2xl p-4">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-fg-subtle">Your draft</p>
          <div className="mt-4 space-y-2.5">
            {[88, 94, 70, 90, 82, 0, 92, 76].map((w, i) =>
              w ? (
                <div key={i} className="relative h-[5px] rounded-full bg-[#c6d3ff]/20" style={{ width: `${w}%` }}>
                  {(i === 1 || i === 4) && (
                    <span className="absolute -bottom-1 left-[20%] h-[3px] w-[45%] rounded-full bg-[repeating-linear-gradient(90deg,rgb(245_195_91/0.7)_0_4px,transparent_4px_7px)]" />
                  )}
                </div>
              ) : (
                <div key={i} className="h-2" />
              ),
            )}
          </div>
        </div>
      </DepthLayer>
      {/* refined */}
      <DepthLayer depth={40} className="right-[6%] top-[14%] h-[76%] w-[52%]">
        <div className="glass-strong noise relative size-full overflow-hidden rounded-2xl p-4">
          <div aria-hidden className="absolute -right-10 -top-10 size-32 rounded-full bg-violet/25 blur-2xl" />
          <p className="relative font-mono text-[9.5px] uppercase tracking-[0.18em] text-violet">Refined</p>
          <Lines className="relative mt-4" widths={[92, 88, 95, 84, 0, 90, 94, 78]} accent={[1, 6]} />
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
