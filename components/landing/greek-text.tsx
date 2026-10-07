"use client";
import { useEffect, useMemo, useRef } from "react";
import { createAnimator, CODE } from "@/lib/greek-decode";

/** The default page: 13 rows of the code-shaped text (blank rows are paragraph gaps). */
export const GREEK_LINES = CODE.slice(0, 13);
const DEFAULT_FLAGGED = [7, 9];

const COLOR_TYPED = "rgb(205 218 255 / 0.72)";
const COLOR_GREEK = "rgb(160 175 230 / 0.5)";
const COLOR_FLAG = "rgb(176 152 255 / 0.95)";

interface Props {
  /** Code-shaped lines to type (stable identity, e.g. a module constant). */
  lines?: string[];
  /** Row indexes drawn as highlighted "flagged" sentences. */
  flagged?: number[];
  /** CSS colour of the flagged rows. */
  flagColor?: string;
  /** Font size classes for a smaller or larger page. */
  textClass?: string;
  /** Cut every line to this many characters (narrow pages). */
  maxChars?: number;
  /** Draw the synced scan beam. Turn off for a secondary page next to the main one. */
  beam?: boolean;
  /** Show the pipeline step in the corner: tokenize → extract features → weigh signals → estimate. */
  caption?: boolean;
  className?: string;
}

/**
 * The document's text, staged as a small ML pipeline: Greek letters laid out
 * like Python are typed one by one (the text arriving, token by token), then
 * a beam sweeps down with a kernel window sliding along it, like a
 * convolution reading features off each row, and re-rolls every letter (see
 * lib/greek-decode). `caption` names the step in the corner. One loop (~18 fps) drives every row and pauses while
 * off-screen. With reduced motion it shows a finished page, static. Fills its
 * parent, which must have a height.
 */
export function GreekText({
  lines = GREEK_LINES,
  flagged = DEFAULT_FLAGGED,
  flagColor = COLOR_FLAG,
  textClass = "text-[9px]",
  maxChars,
  beam = true,
  caption = false,
  className,
}: Props) {
  const rows = useMemo(() => (maxChars ? lines.map((l) => l.slice(0, maxChars)) : lines), [lines, maxChars]);
  const anim = useMemo(() => createAnimator(rows), [rows]);
  const flaggedSet = useMemo(() => new Set(flagged), [flagged]);
  const initial = useMemo(() => anim.staticRows(), [anim]);
  const root = useRef<HTMLDivElement>(null);
  const beamRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLSpanElement>(null);
  const aRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const bRefs = useRef<(HTMLSpanElement | null)[]>([]);

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
          // Flagged rows take their colour from the row (it follows flagColor).
          if (!flaggedSet.has(i)) a.style.color = r.greek ? COLOR_GREEK : COLOR_TYPED;
        }
        if (b) b.textContent = r.noise;
      });
      const cap = capRef.current;
      if (cap) {
        const text =
          f.phase === "type"
            ? `tokenize · ${Math.round(f.chars / 4)} tok`
            : f.phase === "scan"
              ? f.p < 0.55
                ? "extract features"
                : "weigh signals"
              : f.phase === "hold"
                ? "estimate ready"
                : "";
        if (cap.textContent !== text) cap.textContent = text;
      }
      const bm = beamRef.current;
      if (bm) {
        if (f.beam === null) bm.style.opacity = "0";
        else {
          bm.style.opacity = "1";
          bm.style.top = `${((f.beam - 0.5) / (anim.n - 1)) * 100}%`;
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
  }, [anim, flaggedSet]);

  return (
    <div ref={root} className={`relative h-full ${className ?? ""}`} aria-hidden>
      <div className="flex h-full flex-col justify-between">
        {rows.map((line, i) =>
          line === "" ? (
            <div key={i} className="h-1" />
          ) : (
            <div
              key={i}
              className={`font-code relative overflow-hidden whitespace-pre leading-[1.35] ${textClass}`}
              style={flaggedSet.has(i) ? { color: flagColor } : undefined}
            >
              {flaggedSet.has(i) && (
                <span
                  className="absolute inset-y-0 -left-1 right-[12%] rounded-sm"
                  style={{
                    backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)",
                    boxShadow: "inset 0 0 0 1px color-mix(in srgb, currentColor 30%, transparent)",
                  }}
                />
              )}
              <span
                ref={(n) => void (aRefs.current[i] = n)}
                className="relative"
                style={flaggedSet.has(i) ? undefined : { color: COLOR_GREEK }}
              >
                {initial[i].text}
              </span>
              <span ref={(n) => void (bRefs.current[i] = n)} className="relative text-cyan/90" />
            </div>
          ),
        )}
      </div>
      {beam && (
        <div
          ref={beamRef}
          className="pointer-events-none absolute -inset-x-[10%] h-7 -translate-y-full bg-gradient-to-b from-transparent via-cyan/15 to-cyan/60 opacity-0"
          style={{ top: 0, boxShadow: "0 12px 30px -6px rgb(95 216 245 / 0.45)" }}
        >
          {/* the kernel: a window sliding along the row being read */}
          <span className="kernel-slide absolute bottom-0 aspect-square h-[58%] rounded-[2px] border border-white/80 bg-cyan/25 shadow-[0_0_10px_rgb(95_216_245/0.9)]" />
        </div>
      )}
      {caption && (
        <span
          ref={capRef}
          className="pointer-events-none absolute right-0 top-0 rounded-sm bg-ink-950/75 px-1 py-px font-mono text-[6.5px] uppercase leading-none tracking-[0.12em] text-cyan"
        >
          estimate ready
        </span>
      )}
    </div>
  );
}
