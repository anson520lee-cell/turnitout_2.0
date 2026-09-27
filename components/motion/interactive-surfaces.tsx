"use client";
import { useEffect } from "react";

/**
 * One global pointer listener that powers the site's lighting and depth:
 *
 * - Every `.glass` / `.glass-strong` surface under the cursor gets `--px/--py`
 *   (cursor position inside it) and `--lit: 1`, which the CSS in globals.css
 *   turns into a moving sheen and a light-catching border.
 * - Surfaces marked `data-tilt` also get `--rx/--ry` and lean a few degrees
 *   toward the cursor.
 * - `.magnetic` elements (primary buttons) drift slightly toward the cursor.
 * - `:root` gets `--cx/--cy` (-1…1 across the viewport) and `--mx/--my` (px),
 *   used by `[data-depth]` parallax layers and the page-wide cursor light.
 *
 * Runs only for a fine pointer with motion allowed. One rAF per frame, no
 * React state, so it costs almost nothing.
 */
export function InteractiveSurfaces() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduce.matches) return;

    const root = document.documentElement;
    root.dataset.interactive = "true";

    let frame = 0;
    let last: PointerEvent | null = null;
    let lit: HTMLElement | null = null;
    let tilted: HTMLElement | null = null;
    let magnet: HTMLElement | null = null;

    const reset = (el: HTMLElement | null, props: string[]) => {
      if (!el) return;
      props.forEach((p) => el.style.removeProperty(p));
    };

    const update = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      root.style.setProperty("--mx", `${e.clientX}px`);
      root.style.setProperty("--my", `${e.clientY}px`);
      root.style.setProperty("--cx", ((e.clientX / w) * 2 - 1).toFixed(3));
      root.style.setProperty("--cy", ((e.clientY / h) * 2 - 1).toFixed(3));

      const target = e.target instanceof Element ? e.target : null;

      // Lighting on the nearest glass surface.
      const surface = target?.closest<HTMLElement>(".glass, .glass-strong") ?? null;
      if (surface !== lit) {
        reset(lit, ["--lit"]);
        lit = surface;
      }
      if (surface) {
        const r = surface.getBoundingClientRect();
        surface.style.setProperty("--px", `${e.clientX - r.left}px`);
        surface.style.setProperty("--py", `${e.clientY - r.top}px`);
        surface.style.setProperty("--lit", "1");
      }

      // Tilt on the nearest opted-in element.
      const tilt = target?.closest<HTMLElement>("[data-tilt]") ?? null;
      if (tilt !== tilted) {
        reset(tilted, ["--rx", "--ry", "--lift"]);
        tilted = tilt;
      }
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const strength = Number(tilt.dataset.tilt) || 6;
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty("--rx", `${(-ny * strength).toFixed(2)}deg`);
        tilt.style.setProperty("--ry", `${(nx * strength).toFixed(2)}deg`);
        tilt.style.setProperty("--lift", "1");
      }

      // Magnetic buttons.
      const m = target?.closest<HTMLElement>(".magnetic") ?? null;
      if (m !== magnet) {
        reset(magnet, ["--tx", "--ty"]);
        magnet = m;
      }
      if (m) {
        const r = m.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        m.style.setProperty("--tx", `${(dx * 0.18).toFixed(1)}px`);
        m.style.setProperty("--ty", `${(dy * 0.28).toFixed(1)}px`);
        m.style.setProperty("--bx", `${e.clientX - r.left}px`);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onLeave = () => {
      reset(lit, ["--lit"]);
      reset(tilted, ["--rx", "--ry", "--lift"]);
      reset(magnet, ["--tx", "--ty"]);
      lit = tilted = magnet = null;
      root.style.setProperty("--cursor-on", "0");
    };
    const onEnter = () => root.style.setProperty("--cursor-on", "1");

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);
    root.style.setProperty("--cursor-on", "1");
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.interactive;
    };
  }, []);

  return (
    <div
      aria-hidden
      className="cursor-light pointer-events-none fixed inset-0 z-[1] hidden [html[data-interactive]_&]:block"
    />
  );
}
