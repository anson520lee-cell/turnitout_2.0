"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Container, SectionHeading } from "@/components/ui/section";
import { Build } from "@/components/motion/reveal";
import { LensReveal } from "@/components/motion/lens-reveal";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * Why genuine writing can still be flagged, shown under the same lens as the
 * essay in the hero. Four sentences a person might well write sit on a sheet;
 * the lens shows the detector's view of each (the predictable phrases tinted,
 * the reason in the margin), and the reason is spelled out below. The four
 * reasons are also an index: hovering, focusing or pressing one moves the
 * lens to its sentence. Left alone, the lens reads the four in turn.
 *
 * Illustrative: the sentences are written for this page and the tinting is
 * not a measurement, and both are labelled so.
 */

type Part = string | { t: string };
const reasons: { title: string; body: string; note: string; level: "high" | "mid"; sentence: Part[] }[] = [
  {
    title: "Formal academic register",
    body: "Academic conventions reward consistent structure and signposting, which is also what detectors look for.",
    note: "Predictable signposting",
    level: "high",
    sentence: ["This essay will ", { t: "first outline" }, " the main arguments, ", { t: "then evaluate" }, " their limitations, and ", { t: "finally present" }, " a conclusion."],
  },
  {
    title: "Second-language writing",
    body: "Writers working in a second language often favour safer, more predictable phrasing and a narrower vocabulary.",
    note: "Common phrasing",
    level: "mid",
    sentence: [{ t: "In my opinion" }, ", technology is ", { t: "very important" }, " in our daily life and it brings ", { t: "many benefits" }, " to people."],
  },
  {
    title: "Templates and rubrics",
    body: "Following a required structure paragraph by paragraph produces the even, repeated shape detectors weigh.",
    note: "Repeated shape",
    level: "high",
    sentence: [{ t: "Firstly" }, ", the policy reduces costs. ", { t: "Secondly" }, ", it improves access. ", { t: "Lastly" }, ", it supports long-term growth."],
  },
  {
    title: "Heavy editing tools",
    body: "Grammar and style tools can smooth out the natural variation in a draft.",
    note: "Smoothed wording",
    level: "mid",
    sentence: ["The results ", { t: "clearly demonstrate" }, " a ", { t: "significant relationship" }, " between sleep quality and academic performance."],
  },
];

const n2 = (i: number) => String(i + 1).padStart(2, "0");

function Sheet({ view, rowRefs }: { view?: boolean; rowRefs?: { current: (HTMLDivElement | null)[] } }) {
  return (
    <div className={cn("fp-rows", view && "fp-view")}>
      {reasons.map((r, i) => (
        <div
          key={r.title}
          className="fp-row"
          data-level={r.level}
          ref={rowRefs ? (el) => void (rowRefs.current[i] = el) : undefined}
        >
          <span className="fp-gut">{view ? r.note : n2(i)}</span>
          <p className="fp-txt">
            {r.sentence.map((p, k) => (typeof p === "string" ? <span key={k}>{p}</span> : view ? <mark key={k}>{p.t}</mark> : <span key={k}>{p.t}</span>))}
          </p>
        </div>
      ))}
    </div>
  );
}

export function FalsePositives() {
  const reduce = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const lensBox = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // the resting point for the lens: the start of the active sentence
  const place = useCallback(() => {
    const row = rows.current[active];
    const box = lensBox.current?.querySelector<HTMLElement>(".lens-reveal");
    if (!row || !box) return;
    const txt = row.querySelector<HTMLElement>(".fp-txt");
    const b = box.getBoundingClientRect();
    const t = (txt ?? row).getBoundingClientRect();
    setFocus({ x: t.left - b.left + Math.min(t.width * 0.3, 150), y: t.top - b.top + Math.min(t.height / 2, 26) });
  }, [active]);
  useLayoutEffect(() => {
    place();
  }, [place]);
  useEffect(() => {
    const box = lensBox.current;
    if (!box) return;
    const ro = new ResizeObserver(() => place());
    ro.observe(box);
    return () => ro.disconnect();
  }, [place]);

  // left alone and on screen, the lens reads the four in turn
  useEffect(() => {
    const box = lensBox.current;
    if (!box || reduce || pinned) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (e.isIntersecting)
        timer = setInterval(() => {
          if (!hovering.current) setActive((a) => (a + 1) % reasons.length);
        }, 3400);
    });
    io.observe(box);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, [reduce, pinned]);

  const onRead = useCallback((_x: number, y: number) => {
    const box = lensBox.current?.querySelector<HTMLElement>(".lens-reveal");
    if (!box) return;
    const top = box.getBoundingClientRect().top;
    const i = rows.current.findIndex((r) => {
      if (!r) return false;
      const b = r.getBoundingClientRect();
      return y + top >= b.top - 10 && y + top <= b.bottom + 10;
    });
    if (i >= 0) setActive(i);
  }, []);

  const choose = (i: number, pin = false) => {
    setActive(i);
    if (pin) setPinned(true);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = reasons.length - 1;
    const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? Math.min(last, active + 1) : e.key === "ArrowUp" || e.key === "ArrowLeft" ? Math.max(0, active - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    choose(next, true);
    tabs.current[next]?.focus();
  };

  const r = reasons[active];
  return (
    <section className="fp py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
        <div>
          <SectionHeading
            eyebrow="False positives"
            title="Why genuine writing"
            outline="can still be flagged."
            body="Automated AI-writing indicators measure how predictable a text is. Plenty of honest writing is predictable. An indicator is a signal to read carefully, not proof of who wrote something."
          />
          <div role="toolbar" aria-label="Reasons honest writing gets flagged" aria-orientation="vertical" className="fp-index mt-10" onKeyDown={onKey}>
            {reasons.map((x, i) => (
              <button
                key={x.title}
                ref={(el) => void (tabs.current[i] = el)}
                type="button"
                data-press
                tabIndex={i === active ? 0 : -1}
                aria-pressed={i === active}
                data-on={i === active || undefined}
                className="fp-tab"
                onPointerEnter={(e) => e.pointerType === "mouse" && choose(i)}
                onFocus={() => choose(i)}
                onClick={() => choose(i, true)}
              >
                <span className="nav-idx">{n2(i)}</span>
                <span>{x.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          ref={lensBox}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") hovering.current = true;
          }}
          onPointerLeave={() => {
            hovering.current = false;
          }}
        >
          <Build r={22}>
            <div className="fp-sheet glass-strong rounded-[22px]">
              <p className="fp-sheet-label">
                <span>Example sentences</span>
                <span>Detector view</span>
              </p>
              <LensReveal size={74} focus={focus} onRead={onRead} reveal={<Sheet view />}>
                <Sheet rowRefs={rows} />
              </LensReveal>
            </div>
          </Build>
          <div className="fp-readout" aria-live="polite" style={{ "--lvl": r.level === "high" ? "1" : "0.6" } as CSSProperties}>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
              {n2(active)} · {r.note}
            </p>
            <p className="mt-2 text-[15px] font-semibold tracking-tight text-fg">{r.title}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-fg-muted">{r.body}</p>
          </div>
          <p className="mt-4 text-[12px] text-fg-subtle">Sentences written for this page; the detector view is an illustration, not a measurement.</p>
        </div>
      </Container>
    </section>
  );
}
