"use client";
import type { RiskLevel } from "@/lib/scanning/types";
import { cn } from "@/lib/utils";
import { LiveStage } from "@/components/visuals/live-ticker";

/**
 * The scan page's picture: the live ticker (see components/visuals). It is
 * decorative; the only real value on it is the level of the last scan, shown
 * as a small chip once there is one.
 */

const levelDot: Record<RiskLevel, string> = {
  low: "bg-ok",
  moderate: "bg-warn",
  elevated: "bg-risk",
};
const levelLabel: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  elevated: "Elevated",
};

export function ScanVisual({
  level,
  className,
}: {
  level?: RiskLevel | null;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("mx-auto w-full max-w-[520px]", className)}>
      <LiveStage
        className="min-h-[350px]"
        title="Free scan"
        feed={false}
        center
        note={
          level ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-fg-muted">
              <span className={cn("size-1.5 rounded-full", levelDot[level])} />
              last scan: {levelLabel[level]}
            </span>
          ) : undefined
        }
      />
    </div>
  );
}
