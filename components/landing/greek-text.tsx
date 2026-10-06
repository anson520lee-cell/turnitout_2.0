"use client";
import { useEffect, useRef } from "react";
import { decodeLine, staticLine } from "@/lib/greek-decode";

export interface GreekRow {
  /** characters; 0 = blank paragraph gap */
  len: number;
  flagged?: boolean;
}

/**
 * The document's text: rows of random Greek that decode in a wave. One
 * animation loop (~16 fps) drives every row, and it pauses while the block is
 * off-screen. With reduced motion it renders fully decoded, static text.
 */
export function GreekText({ rows }: { rows: GreekRow[] }) {
  const root = useRef<HTMLDivElement>(null);
  const settledRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const noiseRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let visible = true;
    let last = 0;
    const start = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || now - last < 62) return;
      last = now;
      const t = (now - start) / 1000;
      rows.forEach((r, i) => {
        if (!r.len) return;
        const d = decodeLine(r.len, i + 1, t);
        const s = settledRefs.current[i];
        const n = noiseRefs.current[i];
        if (s) s.textContent = d.settled;
        if (n) n.textContent = d.noise;
      });
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(el);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [rows]);

  return (
    <div ref={root} className="flex h-full flex-col justify-between" aria-hidden>
      {rows.map((r, i) =>
        r.len === 0 ? (
          <div key={i} className="h-1.5" />
        ) : (
          <div
            key={i}
            className={`relative overflow-hidden whitespace-nowrap font-mono text-[9px] leading-[1.35] tracking-wide ${
              r.flagged ? "text-violet" : "text-[#c6d3ff]/50"
            }`}
          >
            {r.flagged && (
              <span className="absolute inset-y-0 left-0 right-[20%] -z-0 rounded-sm bg-violet/[0.12] ring-1 ring-violet/30" />
            )}
            <span ref={(n) => void (settledRefs.current[i] = n)} className="relative">
              {staticLine(r.len, i + 1)}
            </span>
            <span ref={(n) => void (noiseRefs.current[i] = n)} className="relative text-cyan/80" />
          </div>
        ),
      )}
    </div>
  );
}
