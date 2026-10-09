import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PricingCards } from "@/components/landing/pricing-cards";
import { Container } from "@/components/ui/section";
import { FaqList } from "@/components/landing/faq-list";
import { faq } from "@/config/faq";
import { freeScan } from "@/config/app";
import { formatCredits, refinementPrice, refinementPricing, screeningPrices } from "@/config/pricing";
import { enabledManualPayments } from "@/config/payments";
import { refinementMinimumLabel, refinementRateLabel, reportService, wordRangeLabel } from "@/config/services";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Free writing scans, ${formatCredits(screeningPrices[reportService])} AI and similarity reports, and writing refinement at ${refinementRateLabel}. Prices are in credits (8 credits = US$1).`,
  alternates: { canonical: "/pricing" },
};

const examples = [1800, 3000, 4250, 12000].map((chars) => ({ chars, price: refinementPrice(chars) }));

export default function PricingPage() {
  const methods = enabledManualPayments().map((m) => m.label);
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Start free. Pay with credits."
        body={`The preliminary scan is free, ${freeScan.dailyLimit} times a day. A Turnitin AI & similarity report is ${formatCredits(screeningPrices[reportService])} flat. Writing refinement is priced by length.`}
      />
      <Container>
        <PricingCards />

        <div className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3">
          <div data-tilt="5" className="glass rounded-2xl p-6 text-[14px] leading-relaxed text-fg-muted">
            <h2 className="text-[15px] font-semibold text-fg">How reports are priced</h2>
            <p className="mt-2">
              {formatCredits(screeningPrices[reportService])} per report for any document of {wordRangeLabel}. One report covers both the
              AI-writing indicator and the similarity result from one screening run. A new screening after you revise is a new report.
            </p>
          </div>
          <div data-tilt="5" className="glass rounded-2xl p-6 text-[14px] leading-relaxed text-fg-muted">
            <h2 className="text-[15px] font-semibold text-fg">How refinement is priced</h2>
            <p className="mt-2">
              {refinementRateLabel}, rounded up to the next {refinementPricing.blockChars}. {refinementMinimumLabel}. Spaces count;
              runs of spaces and line breaks count once. You see the exact price before you pay.
            </p>
            <ul className="mt-3 space-y-1 font-mono text-[12px] text-fg-subtle">
              {examples.map((e) => (
                <li key={e.chars} className="flex justify-between">
                  <span>{e.chars.toLocaleString("en-HK")} chars</span>
                  <span className="text-fg">{formatCredits(e.price)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div data-tilt="5" className="glass rounded-2xl p-6 text-[14px] leading-relaxed text-fg-muted">
            <h2 className="text-[15px] font-semibold text-fg">How credits work</h2>
            <p className="mt-2">
              8 credits = US$1. Top up on the Billing & Credits page by {methods.join(", ")}; card payment is offered where available. We confirm manual payments by hand, then the credits are yours to spend on any report or refinement.
            </p>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-3xl">
          <FaqList items={faq.filter((f) => /guarantee|difference|include|cost|credits|\bpay\b/i.test(f.q))} />
        </div>
      </Container>
    </>
  );
}
