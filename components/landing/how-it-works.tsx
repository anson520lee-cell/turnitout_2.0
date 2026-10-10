"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Container, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";
import { formatCredits, screeningPrices } from "@/config/pricing";
import { reportService } from "@/config/services";

const methods = "crypto (USDT, USDC or BTC) or PayPal";

export const steps = [
  { n: "01", title: "Run a preliminary scan", body: "Paste your text. Get writing-pattern signals in seconds." },
  { n: "02", title: "Review the signals", body: "See which patterns stand out and where, paragraph by paragraph." },
  {
    n: "03",
    title: "Get a report if you need one",
    body: "Press Get report, paste your text into the dialog and press Enter. Only you and the person processing it can see it.",
  },
  {
    n: "04",
    title: "Pay with credits",
    body: `${formatCredits(screeningPrices[reportService])} per AI & similarity report. Top up credits by ${methods}.`,
  },
  { n: "05", title: "Receive your result", body: "Our team runs a Turnitin screening, records exactly what it returned, and sends you the report." },
];

export function HowItWorks({ heading = true }: { heading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 55%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="how-it-works" className="py-24 sm:py-32">
      <Container>
        {heading && (
          <SectionHeading
            eyebrow="How it works"
            title="Five steps, fully visible."
            body="Every order shows its current step in your dashboard, from payment to report."
          />
        )}
        <div ref={ref} className="relative mt-14 pl-10 sm:pl-14">
          <div aria-hidden className="absolute left-[15px] top-2 bottom-2 w-px bg-[var(--line)] sm:left-[23px]" />
          <motion.div
            aria-hidden
            style={{ scaleY }}
            className="absolute left-[15px] top-2 bottom-2 w-px origin-top bg-gradient-to-b from-cyan via-accent to-violet shadow-[0_0_12px_rgb(91_140_255/0.8)] sm:left-[23px]"
          />
          <span
            aria-hidden
            className="axon-pulse absolute left-[14px] h-14 w-[3px] rounded-full bg-gradient-to-b from-transparent via-cyan to-white shadow-[0_0_12px_rgb(95_216_245/0.9)] sm:left-[22px]"
          />
          <ol className="space-y-6">
            {steps.map((s, i) => (
              <li key={s.n} className="relative">
                <Reveal delay={i * 0.04}>
                  <span className="absolute -left-10 top-5 grid size-[31px] place-items-center rounded-full border border-[var(--line-strong)] bg-ink-900 font-mono text-[11px] text-accent sm:-left-14 sm:size-[47px] sm:text-[12px]">
                    {s.n}
                  </span>
                  <div data-tilt="6" className="glass rounded-2xl p-5 sm:p-6">
                    <h3 className="text-[16px] font-semibold tracking-tight">{s.title}</h3>
                    <p className="mt-1.5 text-[14px] text-fg-muted">{s.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
