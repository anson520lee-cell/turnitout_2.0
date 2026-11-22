"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";
import { freeReport } from "@/config/app";
import { reportRateLabel } from "@/config/services";
import { cn } from "@/lib/utils";
import { lensParagraphs, lensSentences, lensSummary, levelLabel, type LensSentence } from "./essay";
import { poseAt, type StageFrame } from "./pose";
import type { LensRenderer, LensSource } from "./lens-gl";

/**
 * The home page's opening: the essay under the lens, then the four chapters
 * (Paste, Read, Report, Refine) played by the same sheet as you scroll.
 *
 * One canvas stays pinned behind the text for the whole run. The hero lets you
 * move a lens over a sample essay to see how a detector reads it; scrolling on
 * stands the sheet up, scans it, folds its lines into the paragraph chart and
 * flips the flagged ones to suggested rewrites. Keyboard: the sentence index
 * under the call to action moves the lens; the chapter list on the right jumps.
 * Without WebGL 2 the hero shows the sheet as plain text and the chapters read
 * as text; with reduced motion the lens rests on the first marked sentence and
 * the chapters change without moving the sheet.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const why = (s: LensSentence) => {
  const t = (s.why ?? "").replace(/^Signals? [\d, ]+:\s*/, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};
const methods = "crypto (USDT, USDC or BTC), PayPal or Alipay";

const chapters = [
  {
    id: "paste",
    n: "01",
    name: "Paste",
    title: "Paste what you are about to hand in.",
    body: `Press Get report and paste your text. Every account gets one full report a day free, for texts of up to ${freeReport.maxChars.toLocaleString("en-HK")} characters.`,
    facts: ["1 free report a day", `Up to ${freeReport.maxChars.toLocaleString("en-HK")} characters`],
    small: `Longer texts, or more reports in a day: ${reportRateLabel}. Pay for that one report by Alipay, or top up credits by ${methods}.`,
    height: "lg:min-h-[115vh]",
  },
  {
    id: "read",
    n: "02",
    name: "Read",
    title: "It reads every sentence, one by one.",
    body: "Your report is made in a few minutes while you watch a live scan. Only you and authorised staff can see your text and your report.",
    facts: ["Live scan", "Sentence by sentence", "Private"],
    height: "lg:min-h-[145vh]",
  },
  {
    id: "report",
    n: "03",
    name: "Report",
    title: "See which paragraphs and sentences could be misread.",
    body: "An overall level, a map of every paragraph, and the sentences to look at again, each with its reason and a question to ask yourself. Download it as a PDF.",
    facts: ["Overall level", "Paragraph map", "PDF"],
    height: "lg:min-h-[125vh]",
  },
  {
    id: "refine",
    n: "04",
    name: "Refine",
    title: "A suggested rewrite beside each flagged sentence.",
    body: "Writing Refinement is an optional add-on for a finished report. Each flagged sentence gets a suggested rewrite, shown beside your own, and you choose, one by one.",
    facts: ["Optional add-on", "You choose"],
    small: "Three times the price of the report, charged only when the suggestions are ready. They are suggestions: no result in any checker is promised.",
    height: "lg:min-h-[125vh]",
  },
] as const;

type Mode = "boot" | "gl" | "static";
type Reading = { n: number; source: LensSource } | null;

/* ------------------------------------------------------------------ pieces */

/** The sentence index: one tick per sentence, its height the risk. Moves and pins the lens. */
function SentenceIndex({
  current,
  pinned,
  onPick,
  onClear,
  tickRefs,
}: {
  current: number | null;
  pinned: number | null;
  onPick: (n: number) => void;
  onClear: () => void;
  tickRefs: RefObject<(HTMLButtonElement | null)[]>;
}) {
  const [roving, setRoving] = useState(1);
  const move = (e: ReactKeyboardEvent<HTMLButtonElement>, n: number) => {
    const last = lensSentences.length;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = n === last ? 1 : n + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = n === 1 ? last : n - 1;
    else if (e.key === "Home") next = 1;
    else if (e.key === "End") next = last;
    else if (e.key === "Escape") {
      onClear();
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setRoving(next);
    tickRefs.current[next - 1]?.focus();
  };
  return (
    <div className="lens-index" data-lens-ignore>
      <span className="lens-index-end hidden sm:block" aria-hidden>
        Sample essay
      </span>
      <div role="toolbar" aria-label="Sentences of the sample essay" className="lens-index-ticks">
        {lensSentences.map((s) => (
          <button
            key={s.n}
            ref={(el) => {
              tickRefs.current[s.n - 1] = el;
            }}
            type="button"
            tabIndex={roving === s.n ? 0 : -1}
            aria-label={`Sentence ${s.n}, ${levelLabel[s.risk]} risk`}
            aria-pressed={pinned === s.n}
            data-risk={s.risk}
            data-on={current === s.n ? "" : undefined}
            className="lens-tick"
            onFocus={() => {
              setRoving(s.n);
              onPick(s.n);
            }}
            onClick={() => onPick(s.n)}
            onKeyDown={(e) => move(e, s.n)}
          >
            <i aria-hidden />
            <span aria-hidden>{pad(s.n)}</span>
          </button>
        ))}
      </div>
      <span className="lens-index-end hidden sm:block" aria-hidden>
        {lensSummary.flagged} of {lensSummary.sentences} flagged
      </span>
    </div>
  );
}

/** What the lens is reading: the sentence's level, the reason, the question, and where it is in the sample report. */
function Readout({ reading }: { reading: Reading }) {
  const s = reading ? lensSentences[reading.n - 1] : null;
  return (
    <div className="lens-readout" data-lens-ignore>
      {s ? (
        <div key={s.n} className="lens-readout-in">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em]">
            <span className="text-accent">S{pad(s.n)}</span>
            <span className="text-fg-subtle"> · </span>
            <span className={s.risk === "high" || s.risk === "medium" ? "text-fg" : "text-fg-muted"}>
              {s.risk === "low" ? "Not marked" : `${levelLabel[s.risk]} risk`}
            </span>
          </p>
          <p className="mt-1.5 line-clamp-2 text-pretty text-[14px] leading-snug text-fg-muted sm:text-[14.5px]">
            {s.risk === "low" ? <span className="lens-serif text-fg/90">{s.text}</span> : why(s)}
            {s.ask && <span className="text-[#a9c1ff]"> {s.ask}</span>}
          </p>
          <Link href={`/sample-report#s-${s.n}`} className="lens-readout-link">
            Sentence {s.n} in the sample report
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : (
        <p className="lens-readout-in font-mono text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
          {lensSummary.words} words · {lensSummary.flagged} of {lensSummary.sentences} sentences flagged · example data
        </p>
      )}
    </div>
  );
}

/** Without WebGL 2: the sample sheet as text, marked the way the report marks it. */
function StaticSheet() {
  return (
    <div className="lens-static glass-strong" aria-hidden>
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-3 font-mono text-[11px] uppercase tracking-[0.16em]">
        <span className="text-accent">Detector view</span>
        <span className="text-fg-muted">
          {lensSummary.flagged} of {lensSummary.sentences} flagged
        </span>
      </div>
      <div className="lens-serif mt-4 space-y-3 text-left text-[15px] leading-[1.75] text-fg-muted">
        {lensParagraphs.slice(0, 2).map((p) => (
          <p key={p.p}>
            {p.sentences.map((s) => (
              <span key={s.n} data-risk={s.risk} className="lens-static-s">
                {s.text}{" "}
              </span>
            ))}
          </p>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the page section */

export function LensHome() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const leaderRef = useRef<SVGPolylineElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLElement>(null);
  const chapterRefs = useRef<(HTMLElement | null)[]>([]);
  const tickRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rendererRef = useRef<LensRenderer | null>(null);
  const stageNow = useRef(0);
  const anchors = useRef<[number, number][]>([[0, 0]]);
  const frame = useRef<StageFrame | null>(null);

  const [mode, setMode] = useState<Mode>("boot");
  const [env, setEnv] = useState<{ compact: boolean; reduced: boolean } | null>(null);
  const [reading, setReading] = useState<Reading>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  // the layout the sheet is painted for, and whether to move it at all
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setEnv((e) => (e && e.compact === !wide.matches && e.reduced === still.matches ? e : { compact: !wide.matches, reduced: still.matches }));
    read();
    wide.addEventListener("change", read);
    still.addEventListener("change", read);
    return () => {
      wide.removeEventListener("change", read);
      still.removeEventListener("change", read);
    };
  }, []);

  /** Positions that do not change while scrolling: where each chapter is, where the sheet starts in the hero. */
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const stage = stageRef.current;
    const slot = slotRef.current;
    if (!wrap || !stage || !slot || !env) return;
    const vh = window.innerHeight;
    const y0 = wrap.getBoundingClientRect().top + window.scrollY;
    const slotTop = slot.getBoundingClientRect().top + window.scrollY - y0;
    const mid = chapterRefs.current.map((el) => {
      if (!el) return 0;
      const b = el.getBoundingClientRect();
      return b.top + window.scrollY + b.height / 2;
    });
    // viewport middle (document y) → stage: hold the hero a moment, then each chapter has its stretch
    anchors.current = [
      [y0 + vh * 0.5, 0],
      [y0 + vh * 0.62, 0],
      [mid[0] - vh * 0.1, 1],
      [mid[0] + vh * 0.12, 1],
      [mid[1] - vh * 0.32, 1.02],
      [mid[1] + vh * 0.24, 2],
      [mid[2] - vh * 0.12, 3],
      [mid[2] + vh * 0.14, 3],
      [mid[3] - vh * 0.06, 4],
    ];
    const r = rendererRef.current;
    if (r) {
      const L = r.sheet;
      const last = L.lines[L.lines.length - 1];
      const W = stage.clientWidth;
      frame.current = {
        W,
        H: stage.clientHeight,
        compact: env.compact,
        w: L.w,
        h: L.h,
        heroTop: slotTop,
        heroWidth: env.compact ? W * 0.94 : Math.min(W * 0.58, 880),
        chartMid: (L.chart.y0 + L.chart.y1) / 2,
        scanFrom: L.header - 8,
        scanTo: last.y1 + 14,
      };
    }
  }, [env]);

  /** Scroll → stage and pose (the renderer eases toward them), chapter progress. */
  const compute = useCallback(() => {
    const a = anchors.current;
    const y = window.scrollY + window.innerHeight / 2;
    let st = a[a.length - 1][1];
    if (y <= a[0][0]) st = a[0][1];
    else
      for (let i = 1; i < a.length; i++) {
        if (y <= a[i][0]) {
          const [x0, s0] = a[i - 1];
          const [x1, s1] = a[i];
          st = s0 + (s1 - s0) * clamp((y - x0) / Math.max(1, x1 - x0));
          break;
        }
      }
    if (env?.reduced) st = Math.round(st);
    stageNow.current = st;
    const r = rendererRef.current;
    if (r && frame.current) {
      r.setStage(st);
      r.setPose(poseAt(st, frame.current));
    }
    const nav = progressRef.current;
    if (nav) {
      nav.style.setProperty("--fill", clamp((st - 1) / 3).toFixed(4));
      nav.style.setProperty("--show", clamp((st - 0.35) / 0.4).toFixed(3));
      nav.dataset.show = st > 0.6 ? "1" : "0";
    }
    const act = st < 0.5 ? 0 : Math.round(clamp(st, 1, 4));
    setActive((p) => (p === act ? p : act));
  }, [env]);

  // the renderer: loaded after the page is interactive, rebuilt if the layout or motion setting changes
  useEffect(() => {
    if (!env) return;
    let dead = false;
    let r: LensRenderer | null = null;
    (async () => {
      try {
        const mod = await import("./lens-gl");
        if (dead) return;
        if (!mod.webgl2Available() || !canvasRef.current) {
          setMode("static");
          return;
        }
        const probe = document.createElement("span");
        probe.style.cssText = "position:absolute;visibility:hidden;font-family:var(--font-sans)";
        document.body.appendChild(probe);
        const sans = getComputedStyle(probe).fontFamily;
        probe.style.fontFamily = "var(--font-mono)";
        const mono = getComputedStyle(probe).fontFamily;
        probe.remove();
        r = new mod.LensRenderer({
          canvas: canvasRef.current,
          input: wrapRef.current,
          hud: hudRef.current,
          leader: leaderRef.current
            ? {
                line: leaderRef.current,
                dot: dotRef.current,
                from: (n) => {
                  const tick = tickRefs.current[n - 1];
                  const c = canvasRef.current;
                  if (!tick || !c || stageNow.current > 0.3) return null;
                  const a = tick.getBoundingClientRect();
                  const b = c.getBoundingClientRect();
                  if (a.bottom < b.top || a.top > b.bottom) return null;
                  return { x: a.left + a.width / 2 - b.left, y: a.bottom + 3 - b.top };
                },
              }
            : null,
          paragraphs: lensParagraphs,
          fonts: { serif: 'Georgia, "Times New Roman", serif', sans, mono },
          compact: env.compact,
          reduced: env.reduced,
          handlers: {
            onSentence: (n, source) => setReading(n === null ? null : { n, source }),
            onPin: (n) => setPinned(n),
            onContextLost: () => {
              rendererRef.current = null;
              setMode("static");
            },
          },
        });
        await r.start();
        if (dead) return;
        rendererRef.current = r;
        measure();
        compute();
        setMode("gl");
      } catch {
        r?.dispose();
        r = null;
        if (!dead) setMode("static");
      }
    })();
    return () => {
      dead = true;
      r?.dispose();
      rendererRef.current = null;
    };
  }, [env, measure, compute]);

  // scroll and resize
  useEffect(() => {
    if (!env) return;
    let raf = 0;
    const onScroll = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          compute();
        });
    };
    const onResize = () => {
      measure();
      compute();
    };
    measure();
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [env, measure, compute]);

  const pick = useCallback((n: number) => {
    rendererRef.current?.focusSentence(n);
    setPinned(n);
    setReading({ n, source: "key" });
  }, []);
  const clear = useCallback(() => {
    rendererRef.current?.focusSentence(null);
    setPinned(null);
  }, []);

  return (
    <div ref={wrapRef} className="lens-home relative" data-mode={mode}>
      {/* the text, scrolling over it */}
      <div className="lens-flow">
        <section className="lens-hero" aria-labelledby="lens-title">
          <Container className="relative pt-24 text-center sm:pt-32">
            {/* a clean 1px outline for the second line: text-stroke would also draw the font's inner overlaps */}
            <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
              <filter id="lens-outline" x="-5%" y="-20%" width="110%" height="140%" colorInterpolationFilters="sRGB">
                <feMorphology in="SourceAlpha" operator="erode" radius="1.15" result="core" />
                <feComposite in="SourceAlpha" in2="core" operator="out" result="ring" />
                <feFlood floodColor="#e9edf7" floodOpacity="0.9" />
                <feComposite in2="ring" operator="in" />
              </filter>
            </svg>
            <h1 id="lens-title" data-no-entrance className="lens-title">
              <span className="lens-title-line">
                <span>Know before</span>
              </span>{" "}
              <span className="lens-title-line lens-title-outline">
                <span>you submit.</span>
              </span>
            </h1>
            <div className="lens-hero-row">
              <p className="max-w-[460px] text-pretty text-[15px] leading-relaxed text-fg-muted sm:text-[16px] lg:text-left">
                Get a report that reads every sentence and shows where your writing could be misread as AI-written. Your
                first one each day is free.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
                <Link href="/services/screening" className={buttonClasses("primary", "lg", "max-sm:h-11 max-sm:px-5 max-sm:text-[14px]")}>
                  Get report
                  <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" />
                </Link>
                <Link href="/sample-report" className={buttonClasses("secondary", "lg", "max-sm:h-11 max-sm:px-5 max-sm:text-[14px]")}>
                  See a sample report
                </Link>
              </div>
            </div>
            {mode !== "static" && (
              <div className="lens-hero-data">
                <Readout reading={reading} />
                <SentenceIndex current={reading?.n ?? null} pinned={pinned} onPick={pick} onClear={clear} tickRefs={tickRefs} />
              </div>
            )}
            <div ref={slotRef} className="lens-slot" aria-hidden />
            {mode === "static" && <StaticSheet />}
          </Container>
        </section>

        <div id="how-it-works" className="lens-chapters">
          {chapters.map((c, i) => (
            <section
              key={c.id}
              id={c.id}
              ref={(el) => {
                chapterRefs.current[i] = el;
              }}
              aria-labelledby={`lens-ch-${c.id}`}
              className={cn("lens-chapter", c.height)}
            >
              <Container>
                <Reveal className="lens-chapter-copy max-lg:glass-strong">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
                    {c.n} <span className="text-fg-subtle">/ 04</span> · {c.name}
                  </p>
                  {/* plain type here: these headings sit over the moving sheet, where a particle assembly would be hard to read */}
                  <h2 id={`lens-ch-${c.id}`} data-no-entrance className="mt-3 text-balance text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[40px] lg:mt-4 lg:leading-[1.08]">
                    {c.title}
                  </h2>
                  <p className="mt-3 text-pretty text-[15px] leading-relaxed text-fg-muted lg:mt-4 lg:text-[15.5px]">{c.body}</p>
                  <ul className="lens-facts">
                    {c.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {"small" in c && c.small && <p className="mt-4 hidden text-[13px] leading-relaxed text-fg-subtle lg:block">{c.small}</p>}
                  {c.id === "refine" && (
                    <div className="mt-8 flex flex-wrap gap-3">
                      <Link href="/services/screening" className={buttonClasses("primary", "lg")}>
                        Get report
                        <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" />
                      </Link>
                      <Link href="/sample-report" className={buttonClasses("secondary", "lg")}>
                        See a sample report
                      </Link>
                    </div>
                  )}
                </Reveal>
              </Container>
            </section>
          ))}
        </div>
      </div>

      {/* the pinned layer, after the text so the heading comes first: the sheet, its labels, the chapter list */}
      <div ref={stageRef} className="lens-stage">
        <div className="lens-canvas">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="A sample essay on a sheet of glass. Under the lens, each sentence shows how an AI-writing detector reads it."
          />
          <svg className="lens-overlay" aria-hidden>
            <polyline ref={leaderRef} className="lens-leader" points="" />
            <circle ref={dotRef} className="lens-leader-dot" r="2.5" cx="0" cy="0" />
          </svg>
          <div ref={hudRef} className="lens-overlay" aria-hidden />
        </div>
        <nav ref={progressRef} aria-label="How it works, step by step" className="lens-progress max-lg:glass">
          <span className="lens-progress-track" aria-hidden>
            <span className="lens-progress-fill" />
          </span>
          {chapters.map((c, i) => (
            <a key={c.id} href={`#${c.id}`} aria-current={active === i + 1 ? "step" : undefined} className="lens-progress-item">
              <span className="font-mono">{c.n}</span>
              <span className="lens-progress-name">{c.name}</span>
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
