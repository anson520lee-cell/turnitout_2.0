"use client";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Container, SectionHeading } from "@/components/ui/section";
import { workflowFrames } from "./workflow-frames";
import styles from "./workflow.module.css";
import { freeReport } from "@/config/app";
import { reportLimitsLabel, reportRateLabel } from "@/config/services";

const methods = "crypto (USDT, USDC or BTC), PayPal or Alipay";

export const steps = [
  {
    n: "01",
    title: "Paste your text",
    body: "Press Get report and paste your text into the dialog. Every account gets one full report a day free.",
  },
  {
    n: "02",
    title: "Press Enter",
    body: "Sign in if you haven't yet. Only you and authorised staff can see your text and your report.",
  },
  {
    n: "03",
    title: "Free or paid",
    body: `Your daily free report covers up to ${freeReport.maxChars.toLocaleString("en-HK")} characters. Longer texts, or more reports in a day, are paid with credits, or by Alipay for just that one report.`,
  },
  {
    n: "04",
    title: "Pay (if paid)",
    body: `${reportRateLabel}. ${reportLimitsLabel}. Pay just that report by Alipay at its exact price, or top up credits by ${methods}.`,
  },
  {
    n: "05",
    title: "Read your report",
    body: "It is made in a few minutes while you watch a live scan: an overall level, a map of every paragraph and the sentences to look at again, with a PDF to download.",
  },
];

/** Reading focus, as a fraction of the viewport height. */
const focusAt = (compact: boolean) => window.innerHeight * (compact ? 0.7 : 0.52);
/** How quickly the chapters follow the page, ms. Short enough to feel attached to the scroll. */
const FOLLOW = 120;

export function HowItWorks({ heading = true }: { heading?: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const rows = list.current;
    const chapters = root.current;
    if (!rows || !chapters) return;
    const compact = matchMedia("(max-width: 767px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const items = Array.from(rows.children) as HTMLElement[];
    const frames = Array.from(chapters.querySelectorAll<HTMLElement>("[data-frame]"));
    let frame = 0,
      last = 0,
      target = 0,
      shown = Number.NaN,
      dirty = true;
    // Where the page says the chapters should be: each step holds still while
    // it is read, then the distance scrolled pulls the next one in. Each row's
    // top rule also fills as the reading line passes through it.
    function read() {
      dirty = false;
      const focusY = focusAt(compact.matches);
      const rects = items.map((row) => row.getBoundingClientRect());
      rects.forEach((rect, i) => {
        const through = Math.max(0, Math.min(1, (focusY - rect.top) / rect.height));
        items[i].style.setProperty("--read", through.toFixed(3));
      });
      const centres = rects.map((rect) => rect.top + rect.height / 2);
      const ahead = centres.findIndex((centre) => centre > focusY);
      target = ahead < 0 ? centres.length - 1 : 0;
      if (ahead > 0) {
        const interval = (focusY - centres[ahead - 1]) / (centres[ahead] - centres[ahead - 1]);
        const t = Math.max(0, Math.min(1, (interval - 0.23) / 0.54));
        target = ahead - 1 + t * t * (3 - 2 * t);
      }
    }
    // One position drives every layer, so text, frame, counter and thumb never disagree.
    function paint(position: number) {
      chapters!.style.setProperty("--position", position.toFixed(4));
      frames.forEach((scene, i) => {
        const offset = Math.max(-1, Math.min(1, i - position));
        scene.style.setProperty("--offset", offset.toFixed(4));
        scene.style.setProperty("--local", (1 - Math.abs(offset)).toFixed(4));
      });
      setActive(Math.round(position));
    }
    function tick(time: number) {
      frame = 0;
      if (dirty) read();
      const dt = last ? Math.min(48, time - last) : 16;
      last = time;
      if (reduced.matches || Number.isNaN(shown)) shown = target;
      else shown += (target - shown) * (1 - Math.exp(-dt / FOLLOW));
      if (Math.abs(target - shown) < 0.001) shown = target;
      paint(reduced.matches ? Math.round(shown) : shown);
      if (shown !== target) frame = requestAnimationFrame(tick);
      else last = 0;
    }
    const schedule = () => {
      dirty = true;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      window.removeEventListener("scroll", schedule);
      if (entry.isIntersecting) window.addEventListener("scroll", schedule, { passive: true });
      schedule();
    });
    const size = new ResizeObserver(schedule);
    observer.observe(rows);
    size.observe(rows);
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    schedule();
    return () => {
      observer.disconnect();
      size.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, []);

  return (
    <section id="how-it-works" aria-label="How it works" className="scroll-mt-16 py-24 sm:py-32">
      <Container>
        {heading && (
          <SectionHeading
            eyebrow="How it works"
            title="Five steps, fully visible."
            body="Every order shows its current step in your dashboard, from payment to report."
          />
        )}
        <div
          ref={root}
          className={styles.chapters}
          style={{ "--chapter": active, "--count": steps.length } as CSSProperties}
        >
          <div className={styles.stage}>
            <div className={styles.stageTop}>
              <span>Sample essay</span>
              <span>
                Step{" "}
                <b className={styles.counter}>
                  <span aria-hidden className={styles.roll}>
                    {steps.map((s) => (
                      <i key={s.n}>{s.n}</i>
                    ))}
                  </span>
                  <span className="sr-only">{steps[active].n}</span>
                </b>{" "}
                / {steps.at(-1)?.n}
              </span>
            </div>
            <div className={styles.window}>
              <div className={styles.film}>
                {workflowFrames.map((scene, i) => (
                  <div
                    key={scene.key}
                    className={styles.frame}
                    aria-hidden={i !== active}
                    data-active={i === active}
                    data-frame
                  >
                    {scene}
                  </div>
                ))}
              </div>
            </div>
            <nav className={styles.segments} aria-label="Workflow chapters">
              {steps.map((s, i) => (
                <a
                  key={s.n}
                  href={`#step-${s.n}`}
                  aria-label={`Step ${i + 1}, ${s.title}`}
                  aria-current={i === active ? "step" : undefined}
                  title={s.title}
                >
                  <span>{s.n}</span>
                </a>
              ))}
            </nav>
          </div>
          <ol className={styles.steps} ref={list}>
            {steps.map((s, i) => (
              <li key={s.n} id={`step-${s.n}`} data-active={i === active}>
                <div className={styles.stepBody}>
                  <span className={styles.ordinal} aria-hidden>
                    {s.n}
                  </span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                    {i === steps.length - 1 && (
                      <a className={styles.openReport} href="/sample-report#risk-by-paragraph">
                        Explore the sample report <ArrowUpRight size={14} aria-hidden className="inline align-text-bottom" />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
