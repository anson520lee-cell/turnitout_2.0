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

export function HowItWorks({ heading = true }: { heading?: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  const film = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const rows = list.current;
    if (!rows) return;
    const compact = matchMedia("(max-width: 767px)");
    let frame = 0;
    function measure() {
      frame = 0;
      if (!rows) return;
      const focusY = window.innerHeight * (compact.matches ? 0.7 : 0.52);
      const centres = Array.from(rows.children, (row) => {
        const rect = row.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      const ahead = centres.findIndex((centre) => centre > focusY);
      let position = ahead < 0 ? centres.length - 1 : 0;
      if (ahead > 0) {
        const interval = (focusY - centres[ahead - 1]) / (centres[ahead] - centres[ahead - 1]);
        // Give each page a stretch of stillness for reading, then let the
        // distance scrolled pull the next page in from the side.
        const t = Math.max(0, Math.min(1, (interval - 0.23) / 0.54));
        position = ahead - 1 + t * t * (3 - 2 * t);
      }
      film.current?.style.setProperty("--position", String(position));
      setActive(Math.round(position));
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
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
    schedule();
    return () => {
      observer.disconnect();
      size.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
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
        <div className={styles.chapters} style={{ "--chapter": active } as CSSProperties}>
          <div className={styles.stage}>
            <div className={styles.stageTop}>
              <span>Sample essay</span>
              <span>
                Step <b>{steps[active].n}</b> / {steps.at(-1)?.n}
              </span>
            </div>
            <div className={styles.window}>
              <div ref={film} className={styles.film}>
                {workflowFrames.map((scene, i) => (
                  <div
                    key={scene.key}
                    className={styles.frame}
                    aria-hidden={i !== active}
                    data-active={i === active}
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
