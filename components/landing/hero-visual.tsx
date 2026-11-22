"use client";
import { LiveStage } from "@/components/visuals/live-ticker";

/** Existing illustrative report console, shown beside the five steps on the homepage. */
export function HeroVisual() {
  return (
    <div className="method-console" aria-hidden>
      <LiveStage className="relative min-h-[500px] sm:min-h-[420px]" chips center />
    </div>
  );
}
