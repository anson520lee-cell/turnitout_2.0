"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Container, SectionHeading } from "@/components/ui/section";
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

export function HowItWorks({ heading = true, visual }: { heading?: boolean; visual?: ReactNode }) {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const stepsList = list.current;
    if (!stepsList) return;
    const items = Array.from(stepsList.children);
    let observer: IntersectionObserver;
    function observeReadingLine() {
      observer?.disconnect();
      const middle = Math.floor(window.innerHeight / 2);
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
          }
        },
        { rootMargin: `-${middle}px 0px -${Math.max(0, window.innerHeight - middle - 2)}px 0px` },
      );
      for (const item of items) observer.observe(item);
    }
    observeReadingLine();
    window.addEventListener("resize", observeReadingLine);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", observeReadingLine);
    };
  }, []);

  return (
    <section id="how-it-works" className="method-section">
      <Container className={visual ? "method-grid" : undefined}>
        {heading && (
          <div className="method-intro">
            <SectionHeading
              eyebrow="How it works"
              title="Five steps, fully visible."
              body="Every order shows its current step in your dashboard, from payment to report."
            />
            {visual}
          </div>
        )}
        <ol ref={list} className="method-steps">
          {steps.map((step, index) => (
            <li key={step.n} data-step={index} data-active={active === index}>
              <span className="method-number">{step.n}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
