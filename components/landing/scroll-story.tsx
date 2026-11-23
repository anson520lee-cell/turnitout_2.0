"use client";
import { useEffect, useRef, useState } from "react";
import { Container } from "@/components/ui/section";

/**
 * From draft to report, on one sheet. The section is pinned while you scroll
 * through it, and the scroll drives an example text through the five stages:
 * pasted in (the lines appear under a caret), cut into sections (hairlines
 * and section marks), read (a scan line passes down and the detector's view
 * shows behind it), put together (a level bar per section) and returned as a
 * report. The list of stages beside it is also an index: press one to go to
 * it.
 *
 * One scroll handler writes five numbers (--p0 … --p4, each stage's 0→1) on
 * the pinned layer; CSS draws everything from them ("From draft to report" in
 * globals.css). Reduced motion: nothing pins, every stage is shown complete.
 * Below 1024px the stages are one row of numbered steps under the sheet, with
 * the current stage's name and line below it, so it all fits a phone screen.
 * Illustrative: the text is written for this page and the levels are not a
 * measurement, and both are labelled so.
 */

const stages = [
  { label: "Paste your text", body: "Press Get report, paste your text and press Enter. One full report a day is free." },
  { label: "Cut into sections", body: "Your text is split into sections so that every sentence gets read." },
  { label: "Reading", body: "Every sentence and paragraph is read while you watch a live scan of your own text." },
  { label: "Putting it together", body: "The sections are joined into one report with a PDF to download." },
  { label: "Report ready", body: "An overall level, a map of your text and the sentences to look at again, in a few minutes." },
];

type Level = "high" | "mid" | "low";
type Part = string | { t: string; l: Exclude<Level, "low"> };
const paragraphs: { level: Level; name: string; parts: Part[] }[] = [
  {
    level: "mid",
    name: "Medium",
    parts: [
      "Cities that once planned around cars are turning streets back over to people. Buses, bikes and wider pavements now share the same narrow space, which is ",
      { t: "a significant challenge", l: "mid" },
      " for planners.",
    ],
  },
  {
    level: "high",
    name: "High",
    parts: [
      { t: "It is important to note that", l: "high" },
      " public transport ",
      { t: "plays a vital role in modern society", l: "high" },
      ". ",
      { t: "Furthermore", l: "mid" },
      ", it offers ",
      { t: "many benefits to people", l: "mid" },
      " in their daily lives.",
    ],
  },
  {
    level: "low",
    name: "Low",
    parts: ["Last winter I timed my own commute for a month. The bus beat walking on only nine of the twenty days, mostly when it rained."],
  },
];

// where in the section's scroll (0 → 1) each stage's drawing runs
const RANGES: [number, number][] = [
  [0, 0.15],
  [0.21, 0.35],
  [0.41, 0.6],
  [0.63, 0.76],
  [0.82, 0.94],
];
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const n2 = (i: number) => String(i + 1).padStart(2, "0");

function Doc({ view }: { view?: boolean }) {
  return (
    <div className={view ? "story-copy story-view" : "story-copy story-plain"} aria-hidden={view || undefined}>
      {paragraphs.map((p, i) => (
        <div key={p.name} className="story-par" data-level={p.level}>
          <span className="story-sec">§ {n2(i)}</span>
          <p className="story-txt">
            {p.parts.map((x, k) => (typeof x === "string" ? <span key={k}>{x}</span> : view ? <mark key={k} data-l={x.l}>{x.t}</mark> : <span key={k}>{x.t}</span>))}
          </p>
          <span className="story-meter">
            <span className="story-meter-bar">
              <i />
            </span>
            <span className="story-meter-label">{p.name}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function ScrollStory() {
  const ref = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const sec = ref.current;
    const pin = pinRef.current;
    if (!sec || !pin) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    const update = () => {
      raf = 0;
      if (reduce.matches) {
        for (let i = 0; i < 5; i++) pin.style.removeProperty(`--p${i}`);
        setActive(4);
        return;
      }
      const r = sec.getBoundingClientRect();
      // the pinned layer's own height (100svh): steady on phones, where window.innerHeight changes as the browser bar slides
      const sp = clamp(-r.top / Math.max(1, r.height - (pin.clientHeight || window.innerHeight)));
      RANGES.forEach(([a, b], i) => pin.style.setProperty(`--p${i}`, clamp((sp - a) / (b - a)).toFixed(4)));
      const act = Math.min(4, Math.floor(sp * 5));
      setActive((p) => (p === act ? p : act));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduce.addEventListener("change", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduce.removeEventListener("change", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // the stage list is an index: go to the point where that stage has finished drawing
  const go = (i: number) => {
    const sec = ref.current;
    if (!sec) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = sec.getBoundingClientRect().top + window.scrollY;
    const total = sec.offsetHeight - (pinRef.current?.clientHeight || window.innerHeight);
    window.scrollTo({ top: top + total * (RANGES[i][1] + 0.01), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section ref={ref} className="story" aria-labelledby="story-title">
      <div ref={pinRef} className="story-pin">
        <Container className="story-grid">
          <div className="story-side">
            <p id="story-title" className="section-eyebrow">
              <span>From draft to report</span>
            </p>
            <ol className="story-list">
              {stages.map((s, i) => (
                <li key={s.label} className="story-item" data-on={i === active || undefined} data-done={i < active || undefined}>
                  <button type="button" data-press className="story-step" aria-current={i === active ? "step" : undefined} onClick={() => go(i)}>
                    <span className="story-step-n">{n2(i)}</span>
                    <span className="story-step-name">{s.label}</span>
                  </button>
                  <div className="story-step-body">
                    <p>
                      {/* phones: the step row shows numbers only, so the current stage's name heads its line */}
                      <span className="story-step-title" aria-hidden>
                        {s.label}
                      </span>
                      {s.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div
            className="story-sheet glass-strong"
            role="img"
            aria-label="Illustration: an example text is pasted in, cut into sections, read sentence by sentence, put together, and returned as a report."
          >
            <p className="story-sheet-label">
              <span>Example text</span>
              <span>
                {n2(active)} · {stages[active].label}
              </span>
            </p>
            <div className="story-doc">
              <Doc />
              <Doc view />
              <span aria-hidden className="story-caret" />
              <span aria-hidden className="story-scan" />
            </div>
            <p className="story-sum">3 sections · 6 sentences · 3 to look at again</p>
            <div className="story-report">
              <p className="story-report-label">Report ready</p>
              <div className="story-report-grid">
                <div>
                  <svg viewBox="0 0 120 66" className="story-gauge" aria-hidden>
                    <path d="M10 60 A50 50 0 0 1 110 60" pathLength={100} className="story-gauge-track" />
                    <path d="M10 60 A50 50 0 0 1 110 60" pathLength={100} className="story-gauge-fill" />
                  </svg>
                  <p className="story-report-k">Overall level</p>
                  <p className="story-report-v">Medium</p>
                </div>
                <div>
                  <p className="story-report-k">Map of your text</p>
                  <ul className="story-map">
                    {paragraphs.map((p, i) => (
                      <li key={p.name} data-level={p.level}>
                        <span>§ {n2(i)}</span>
                        <i />
                      </li>
                    ))}
                  </ul>
                  <p className="story-report-k mt-3">To look at again</p>
                  <p className="story-report-v">3 sentences</p>
                </div>
              </div>
            </div>
          </div>
        </Container>
        <p className="story-note">Text written for this page; the levels are an illustration, not a measurement.</p>
      </div>
    </section>
  );
}
