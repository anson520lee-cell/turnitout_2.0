"use client";
import { useEffect } from "react";
import { startPointerEngine } from "./pointer-engine";
import { startPressEffects } from "./press-effects";

/**
 * Mounts the pointer engine (see `pointer-engine.ts`: the light that glass
 * edges catch, magnetic buttons, parallax, and the shared frame loop the
 * reading lenses join) and the press feedback (`press-effects.ts`: a thin
 * ring from the press point, on mouse and touch alike).
 *
 * The engine runs only for a fine pointer with motion allowed. Both
 * conditions are watched live, not just read once at mount: this component
 * stays mounted for the whole visit (it lives in the root layout), so a
 * setting changed mid-session (pointer type on a 2-in-1, or reduced motion
 * turned on) starts or stops the engine to match.
 */
export function InteractiveSurfaces() {
  useEffect(() => startPressEffects(), []);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop: (() => void) | null = null;
    const sync = () => {
      const want = fine.matches && !reduce.matches;
      if (want && !stop) stop = startPointerEngine();
      else if (!want && stop) {
        stop();
        stop = null;
      }
    };
    sync();
    fine.addEventListener("change", sync);
    reduce.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      reduce.removeEventListener("change", sync);
      stop?.();
    };
  }, []);

  return null;
}
