"use client";
import { useId, useState } from "react";
import { ArrowRight, CheckCheck, FileText, Fingerprint, Gauge, Wallet } from "lucide-react";
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

const icons = [FileText, Fingerprint, Gauge, Wallet, CheckCheck];

export function HowItWorks({ heading = true }: { heading?: boolean }) {
  const [index, setIndex] = useState(0);
  const id = useId();
  const step = steps[index];
  const Icon = icons[index];
  return (
    <section id="how-it-works" className="mission-section scroll-mt-20">
      <Container>
        {heading && (
          <SectionHeading
            eyebrow="How it works"
            title="Five steps, fully visible."
            body="Every order shows its current step in your dashboard, from payment to report."
          />
        )}
        <div className="flight-path">
          <ol aria-label="Steps from draft to report">
            {steps.map((item, i) => (
              <li key={item.n}>
                <button type="button" onClick={() => setIndex(i)} aria-pressed={i === index} aria-controls={id}>
                  <span className="flight-dot" aria-hidden />
                  <small>{item.n}</small>
                  <span>{item.title}</span>
                  <ArrowRight size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ol>
          <div className="flight-reading" id={id}>
            <div className="flight-instrument" aria-hidden>
              <i />
              <i />
              <i />
              <Icon key={index} size={28} strokeWidth={1} />
            </div>
            <div key={step.n} className="flight-detail" aria-live="polite">
              <span className="orbit-micro">Step {step.n} / 05</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
            <button type="button" className="orbit-text-link" onClick={() => setIndex((index + 1) % steps.length)}>
              {index === steps.length - 1 ? "Back to first step" : "Next step"}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </Container>
    </section>
  );
}
