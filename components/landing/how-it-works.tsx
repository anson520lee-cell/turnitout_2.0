import type { CSSProperties } from "react";
import { Container, SectionHeading } from "@/components/ui/section";
import { freeReport } from "@/config/app";
import { reportLimitsLabel, reportRateLabel } from "@/config/services";

const methods = "crypto (USDT, USDC or BTC), PayPal or Alipay";

export const steps = [
  { n: "01", title: "Paste your text", body: "Press Get report and paste your text into the dialog. Every account gets one full report a day free." },
  { n: "02", title: "Press Enter", body: "Sign in if you haven't yet. Only you and authorised staff can see your text and your report." },
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
  { n: "05", title: "Read your report", body: "It is made in a few minutes while you watch a live scan: an overall level, a map of every paragraph and the sentences to look at again, with a PDF to download." },
];

/**
 * The five steps on one thin rail. As you scroll, the rail fills down to the
 * reading line and each step's node lights as it reaches it, so the eye
 * always knows which step it is on. All CSS (scroll-driven, see "Steps
 * rail" in globals.css); without scroll timelines, or with reduced motion,
 * the rail is simply drawn and every node lit.
 */
export function HowItWorks({ heading = true }: { heading?: boolean }) {
  return (
    <section id="how-it-works" className={heading ? "py-24 sm:py-32" : "pb-24 pt-6 sm:pb-32 sm:pt-10"}>
      <Container>
        {heading && (
          <SectionHeading
            eyebrow="How it works"
            title="Five steps,"
            outline="fully visible."
            body="Every order shows its current step in your dashboard, from payment to report."
          />
        )}
        <ol className={heading ? "steps mt-14" : "steps"} aria-label="Five steps from text to report">
          {steps.map((s, i) => (
            <li key={s.n} className="step" style={{ "--i": i } as CSSProperties}>
              <span aria-hidden className="step-node" />
              <span className="step-n">{s.n}</span>
              <div className="step-body">
                <h3 className="step-title">{s.title}</h3>
                <p className="step-text">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
