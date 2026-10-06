"use client";
import { useEffect, useMemo, useRef } from "react";
import { createAnimator, CODE } from "@/lib/greek-decode";

const LINES = CODE.slice(0, 13);
const FLAGGED = new Set([7, 9]);

const COLOR_CODE = "rgb(205 218 255 / 0.72)";
const COLOR_GREEK = "rgb(160 175 230 / 0.5)";
const COLOR_FLAG = "rgb(176 152 255 / 0.95)";

/**
 * The document's text: Python typed by an invisible hand, then a scan beam
 * turns every glyph into random Greek (see lib/greek-decode). One loop
 * (~16 fps) drives every row and pauses while off-screen. With reduced motion
 * it shows the finished Greek page, static.
 */
export function GreekText() {
  const anim = useMemo(() => createAnimator(LINES), []);
  const root = useRef<HTMLDivElement>(null);
  const beamRef = useRef<HTMLDivElement>(null);
  const aRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const bRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const initial = useMemo(() => anim.staticRows(), [anim]);

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
      if (!visible || now - last < 55) return;
      last = now;
      const f = anim.frame((now - start) / 1000);
      f.rows.forEach((r, i) => {
        const a = aRefs.current[i];
        const b = bRefs.current[i];
        if (a) {
          a.textContent = r.text;
          a.style.color = FLAGGED.has(i) ? COLOR_FLAG : r.greek ? COLOR_GREEK : COLOR_CODE;
        }
        if (b) b.textContent = r.noise;
      });
      const beam = beamRef.current;
      if (beam) {
        if (f.beam === null) beam.style.opacity = "0";
        else {
          beam.style.opacity = "1";
          beam.style.top = `${((f.beam - 0.5) / (anim.n - 1)) * 100}%`;
        }
      }
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
  }, [anim]);

  return (
    <div ref={root} className="relative h-full" aria-hidden>
      <div className="flex h-full flex-col justify-between">
        {LINES.map((line, i) =>
          line === "" ? (
            <div key={i} className="h-1.5" />
          ) : (
            <div key={i} className="relative overflow-hidden whitespace-pre font-mono text-[9px] leading-[1.35]">
              {FLAGGED.has(i) && (
                <span className="absolute inset-y-0 -left-1 right-[12%] rounded-sm bg-violet/[0.12] ring-1 ring-violet/30" />
              )}
              <span
                ref={(n) => void (aRefs.current[i] = n)}
                className="relative"
                style={{ color: FLAGGED.has(i) ? COLOR_FLAG : COLOR_GREEK }}
              >
                {initial[i].text}
              </span>
              <span ref={(n) => void (bRefs.current[i] = n)} className="relative text-cyan/90" />
            </div>
          ),
        )}
      </div>
      {/* scan beam, driven by the same clock as the text */}
      <div
        ref={beamRef}
        className="pointer-events-none absolute -inset-x-[10%] h-7 -translate-y-full bg-gradient-to-b from-transparent via-cyan/15 to-cyan/60 opacity-0"
        style={{ top: 0, boxShadow: "0 12px 30px -6px rgb(95 216 245 / 0.45)" }}
      />
    </div>
  );
}
