"use client";
import { LiveStage } from "@/components/visuals/live-ticker";

/**
 * The home page's picture: the live ticker on a glass stage, lit by a soft
 * glow and a fading grid. Decorative; the numbers are made up.
 */
export function HeroVisual() {
  return (
    <div className="w-full max-w-[560px] lg:max-w-[700px]" aria-hidden>
      <div className="relative w-full select-none">
        {/* radial lighting behind the stage */}
        <div
          data-depth="-2"
          className="absolute inset-[-24%] bg-[radial-gradient(closest-side,rgb(91_140_255/0.26),rgb(110_130_255/0.17)_22%,rgb(130_125_255/0.09)_42%,rgb(154_123_255/0.04)_62%,rgb(154_123_255/0.012)_80%,transparent)]"
        />
        <div
          data-depth="-1"
          className="absolute inset-[-12%] bg-grid [mask-image:radial-gradient(closest-side,black_30%,transparent)] opacity-50"
        />
        <LiveStage className="relative min-h-[520px] sm:min-h-[430px]" chips center />
      </div>
    </div>
  );
}
