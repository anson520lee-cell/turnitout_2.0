"use client";
import { useEffect, useRef } from "react";
import { startPointerEngine } from "./pointer-engine";
import { startPressEffects } from "./press-effects";

/**
 * Mounts the pointer engine (see `pointer-engine.ts`) and the light layers it
 * moves:
 * - a large soft light *behind* the content that lags the cursor, so glass
 *   panes glow from behind as it passes and a faint grid shows where it falls;
 * - a small glow above the content, and a ripple of light on click (buttons
 *   and clickable cards get their own press ripple instead, from
 *   `press-effects.ts`, which also runs on touch screens).
 *
 * Runs only for a fine pointer with motion allowed; otherwise nothing here is
 * shown and the CSS effects keyed on html[data-interactive] stay off.
 */
export function InteractiveSurfaces() {
  const back = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const ripples = useRef<HTMLDivElement>(null);

  useEffect(() => startPressEffects(), []);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduce.matches) return;
    if (!back.current || !halo.current || !ripples.current) return;
    return startPointerEngine({
      back: back.current,
      backGrid: grid.current,
      halo: halo.current,
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
      <div ref={ripples} />
    </div>
  );
}
