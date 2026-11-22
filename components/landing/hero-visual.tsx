"use client";
import { SentenceStudy } from "@/components/visuals/sentence-study";

/** Inspect the example essay on the original glass stage. */
export function HeroVisual() {
  return (
    <div className="w-full max-w-[560px] lg:max-w-[700px]">
      <div className="relative w-full select-none">
        {/* radial lighting behind the stage */}
        <div
          aria-hidden
          data-depth="-2"
          className="absolute inset-[-24%] bg-[radial-gradient(closest-side,rgb(91_140_255/0.26),rgb(100_135_255/0.17)_22%,rgb(110_140_255/0.09)_42%,rgb(141_150_172/0.04)_62%,rgb(141_150_172/0.012)_80%,transparent)]"
        />
        <div
          aria-hidden
          data-depth="-1"
          className="absolute inset-[-12%] bg-grid [mask-image:radial-gradient(closest-side,black_30%,transparent)] opacity-50"
        />
        <SentenceStudy />
      </div>
    </div>
  );
}
