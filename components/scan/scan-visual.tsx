"use client";
import type { CSSProperties, ReactNode } from "react";
import type { RiskLevel } from "@/lib/scanning/types";
import { cn } from "@/lib/utils";
import { GreekText } from "@/components/landing/greek-text";
import { CODE } from "@/lib/greek-decode";

/**
 * The 3D paper stack on the scan page's hero card. Decorative only.
 *
 * It reads the lighting variables that `InteractiveSurfaces` writes, so it
 * needs no listeners of its own:
 * - `--rx/--ry/--lift`, inherited from the tilted card, turn the stack (more
 *   than the card itself, which reads as depth) and lift the signal chips;
 * - `--cx/--cy` (written on this `data-cursor` root) move the specular
 *   highlight toward the cursor, and `data-depth` slides the glow with it and
 *   the cast shadow away from it.
 * On touch or with reduced motion none of these are set and it sits still.
 */

const SCAN_LINES = CODE.slice(0, 14);
/** Rows drawn as "flagged" sentences, tinted by the last result. */
const FLAGGED = [7, 9];

const levelColor: Record<RiskLevel, string> = {
  low: "rgb(79 209 165 / 0.95)",
  moderate: "rgb(245 195 91 / 0.95)",
  elevated: "var(--color-risk, #f0616d)",
};
const levelDot: Record<RiskLevel, string> = { low: "bg-ok", moderate: "bg-warn", elevated: "bg-risk" };
const levelLabel: Record<RiskLevel, string> = { low: "Low", moderate: "Moderate", elevated: "Elevated" };

const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function Chip({ z, className, children }: { z: number; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "absolute whitespace-nowrap rounded-full border border-[var(--line-strong)] bg-ink-800/90 px-3 py-1.5 text-[11.5px] font-medium text-fg shadow-[0_14px_30px_-12px_rgb(0_0_0/0.9),0_0_22px_-8px_rgb(91_140_255/0.6)]",
        className,
      )}
      style={{ transform: `translateZ(calc(${z}px + var(--lift, 0) * 34px))`, transition: `transform 0.6s ${ease}` }}
    >
      {children}
    </div>
  );
}

export function ScanVisual({ level, className }: { level?: RiskLevel | null; className?: string }) {
  const stack: CSSProperties = {
    transform: "rotateX(calc(12deg + var(--rx, 0deg) * 2.4)) rotateY(calc(-20deg + var(--ry, 0deg) * 2.8))",
    transition: `transform 0.7s ${ease}`,
  };
  const specular: CSSProperties = {
    background:
      "radial-gradient(190px circle at calc(55% + var(--cx, 0) * 55%) calc(25% + var(--cy, 0) * 55%), rgb(190 208 255 / 0.2), transparent 70%)",
  };

  return (
    <div aria-hidden data-cursor className={cn("relative mx-auto h-[250px] w-full max-w-[380px] select-none sm:h-[290px]", className)}>
      <div data-depth="2" className="absolute inset-[6%] rounded-full bg-[radial-gradient(closest-side,rgb(91_140_255/0.3),rgb(154_123_255/0.1)_55%,transparent)]" />
      <div data-depth="-3" className="absolute inset-x-[24%] bottom-[3%] h-9 rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.75),transparent)]" />

      <div className="absolute inset-0 [perspective:900px]">
        <div
          // Bobs on the compositor (CSS), not a JS animation running every frame.
          className="doc-bob absolute inset-0 [transform-style:preserve-3d]"
        >
          <div className="absolute inset-y-[9%] inset-x-[22%] [transform-style:preserve-3d]" style={stack}>
            {/* Pages behind, offset up and right like a fanned stack. */}
            <div
              className="absolute inset-0 rounded-2xl border border-violet/25 bg-violet/[0.07]"
              style={{ transform: "translate3d(18px, -16px, -64px)" }}
            />
            <div
              className="absolute inset-0 rounded-2xl border border-accent/25 bg-accent/[0.07]"
              style={{ transform: "translate3d(9px, -8px, -32px)" }}
            />

            {/* Front page: text lines, the scan beam and a highlight that follows the light. */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-gradient-to-b from-ink-700/95 to-ink-800/95 p-[11%] shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_30px_60px_-24px_rgb(0_0_0/0.9)]">
              {/* Greek letters typed like code, then re-rolled by the scan beam. */}
              <div className="absolute inset-[11%]">
                <GreekText lines={SCAN_LINES} flagged={FLAGGED} flagColor={level ? levelColor[level] : undefined} textClass="text-[7.5px]" maxChars={28} />
              </div>
              <div className="pointer-events-none absolute inset-0" style={specular} />
            </div>

            <Chip z={64} className="-left-[30%] top-[12%]">
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-cyan align-middle shadow-[0_0_8px_rgb(95_216_245/0.9)]" />
              Rhythm
            </Chip>
            <Chip z={40} className="-right-[34%] top-[40%]">
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-violet align-middle shadow-[0_0_8px_rgb(154_123_255/0.9)]" />
              Phrasing
            </Chip>
            <Chip z={88} className="-left-[18%] bottom-[8%]">
              {level ? (
                <>
                  <span className={cn("mr-1.5 inline-block size-1.5 rounded-full align-middle", levelDot[level])} />
                  Last scan: {levelLabel[level]}
                </>
              ) : (
                <>
                  <span className="mr-1.5 inline-block size-1.5 rounded-full bg-accent align-middle shadow-[0_0_8px_rgb(91_140_255/0.9)]" />
                  Readability
                </>
              )}
            </Chip>
          </div>
        </div>
      </div>
    </div>
  );
}
