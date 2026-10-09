"use client";
import type { CSSProperties } from "react";
import type { RiskLevel } from "@/lib/scanning/types";
import { cn } from "@/lib/utils";
import { GreekText } from "@/components/landing/greek-text";
import { CODE } from "@/lib/greek-decode";
import { AgentTerminal } from "@/components/landing/agent-terminal";

/**
 * The 3D paper stack on the scan page's hero card, with the agent terminal
 * beside it (the same console as the home page). Decorative only.
 *
 * It reads the lighting variables that `InteractiveSurfaces` writes, so it
 * needs no listeners of its own:
 * - `--rx/--ry/--lift`, inherited from the tilted card, turn the stack (more
 *   than the card itself, which reads as depth);
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

const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";

export function ScanVisual({
  level,
  className,
}: {
  level?: RiskLevel | null;
  className?: string;
}) {
  const stack: CSSProperties = {
    transform:
      "rotateX(calc(12deg + var(--rx, 0deg) * 2.4)) rotateY(calc(-20deg + var(--ry, 0deg) * 2.8))",
    transition: `transform 0.7s ${ease}`,
  };
  const specular: CSSProperties = {
    background:
      "radial-gradient(190px circle at calc(55% + var(--cx, 0) * 55%) calc(25% + var(--cy, 0) * 55%), rgb(190 208 255 / 0.2), transparent 70%)",
  };

  return (
    <div aria-hidden className={cn("mx-auto w-full max-w-[520px]", className)}>
      <div
        data-cursor
        className="relative h-[250px] w-full select-none sm:h-[290px]"
      >
        <div
          data-depth="2"
          className="absolute inset-[6%] rounded-full bg-[radial-gradient(closest-side,rgb(91_140_255/0.3),rgb(154_123_255/0.1)_55%,transparent)]"
        />
        <div
          data-depth="-3"
          className="absolute inset-x-[24%] bottom-[3%] h-9 rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.75),transparent)]"
        />
        <div className="absolute inset-y-0 left-0 right-0 [perspective:900px] sm:left-[44%]">
          <div
            // Bobs on the compositor (CSS), not a JS animation running every frame.
            className="doc-bob absolute inset-0 [transform-style:preserve-3d]"
          >
            <div
              className="absolute inset-y-[9%] inset-x-[22%] [transform-style:preserve-3d] sm:inset-x-[8%]"
              style={stack}
            >
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
                  <GreekText
                    lines={SCAN_LINES}
                    flagged={FLAGGED}
                    flagColor={level ? levelColor[level] : undefined}
                    textClass="text-[7.5px]"
                    maxChars={28}
                    caption
                  />
                </div>
                <div
                  className="pointer-events-none absolute inset-0"
                  style={specular}
                />
              </div>
            </div>
          </div>
        </div>

        {/* the agent's console beside the page, as on the home page */}
        <div
          data-depth="2"
          className="absolute left-0 top-1/2 z-10 hidden w-[66%] -translate-y-1/2 sm:block"
        >
          <AgentTerminal
            note={
              level ? (
                <span className="inline-flex items-center gap-1 text-fg-muted">
                  <span
                    className={cn("size-1.5 rounded-full", levelDot[level])}
                  />
                  last scan: {levelLabel[level]}
                </span>
              ) : undefined
            }
          />
        </div>
      </div>
      {/* phones: the console sits under the page instead of beside it */}
      <AgentTerminal
        className="mt-2 sm:hidden"
        note={
          level ? (
            <span className="inline-flex items-center gap-1 text-fg-muted">
              <span className={cn("size-1.5 rounded-full", levelDot[level])} />
              last scan: {levelLabel[level]}
            </span>
          ) : undefined
        }
      />
    </div>
  );
}
