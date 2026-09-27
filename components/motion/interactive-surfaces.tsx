"use client";
import { useEffect, useRef } from "react";
import { startPointerEngine } from "./pointer-engine";

/**
 * Mounts the pointer engine (see `pointer-engine.ts`) and the light layers it
 * moves:
 * - a large soft light *behind* the content that lags the cursor, so glass
 *   panes glow from behind as it passes and a faint grid shows where it falls;
 * - a small glow above the content, a short light trail when the cursor moves
 *   fast, and a ripple of light on click.
 *
 * Runs only for a fine pointer with motion allowed; otherwise nothing here is
 * shown and the CSS effects keyed on html[data-interactive] stay off.
 */
export function InteractiveSurfaces() {
  const back = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const trailSvg = useRef<SVGSVGElement>(null);
  const trailGrad = useRef<SVGLinearGradientElement>(null);
  const trailPaths = useRef<(SVGPathElement | null)[]>([]);
  const ripples = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduce.matches) return;
    if (!back.current || !halo.current || !ripples.current) return;
    return startPointerEngine({
      back: back.current,
      backGrid: grid.current,
      halo: halo.current,
      trail:
        trailSvg.current && trailGrad.current
          ? {
              svg: trailSvg.current,
              gradient: trailGrad.current,
              paths: trailPaths.current.filter((t): t is SVGPathElement => !!t),
            }
          : null,
      ripples: ripples.current,
    });
  }, []);

  return (
    <div aria-hidden className="light-layers">
      <div ref={back} className="light-back">
        <div className="light-back-grid-window">
          <div ref={grid} className="light-back-grid" />
        </div>
        <div className="light-back-vignette" />
        <div className="light-back-glow" />
      </div>
      <div ref={halo} className="light-halo" />
      <svg ref={trailSvg} className="light-trail">
        <defs>
          <linearGradient ref={trailGrad} id="light-trail-fade" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#d8f4ff" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#5fd8f5" stopOpacity="0.55" />
            <stop offset="1" stopColor="#6f6bff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[10, 4, 1.6].map((w, i) => (
          <path
            key={w}
            ref={(el) => {
              trailPaths.current[i] = el;
            }}
            fill="none"
            stroke="url(#light-trail-fade)"
            strokeWidth={w}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={[0.14, 0.4, 1][i]}
          />
        ))}
      </svg>
      <div ref={ripples} />
    </div>
  );
}
