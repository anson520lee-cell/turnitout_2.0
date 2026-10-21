import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PricingCards } from "@/components/landing/pricing-cards";
import { Container } from "@/components/ui/section";
import { FaqList } from "@/components/landing/faq-list";
import { faq } from "@/config/faq";
import { freeReport, freeScan } from "@/config/app";
import { formatCredits, refinementPrice, refinementPricing, reportPrice, reportPricing, topUpBonusTiers } from "@/config/pricing";
import { refinementMinimumLabel, refinementRateLabel, reportMinimumLabel, reportRangeLabel, reportRateLabel } from "@/config/services";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Free writing scans, AI-writing risk reports (${reportRateLabel}), and writing refinement at ${refinementRateLabel}. Prices are in credits (1 credit = HK$1).`,
  alternates: { canonical: "/pricing" },
};

const examples = [1800, 3000, 4250, 12000].map((chars) => ({ chars, price: refinementPrice(chars) }));
const reportExamples = [1500, 3000, 6000, 20000, 50000].map((chars) => ({ chars, price: reportPrice(chars) }));

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Start free. Pay with credits."
        body={`The preliminary scan is free, ${freeScan.dailyLimit} times a day, and every account gets ${freeReport.dailyLimit} full report a day free (up to ${freeReport.maxChars.toLocaleString("en-HK")} characters). Longer texts: the AI-writing risk report and writing refinement are both priced by length.`}
      />
      <Container>
        <PricingCards headingAs="h2" />

        <div className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3">
          <div data-tilt="5" className="glass rounded-2xl p-6 text-[14px] leading-relaxed text-fg-muted">
            <h2 className="text-[15px] font-semibold text-fg">How reports are priced</h2>
            <p className="mt-2">
              {reportRateLabel}, rounded up to the next {reportPricing.blockChars}. {reportMinimumLabel}. For texts of {reportRangeLabel}. Spaces count; runs of
              spaces and line breaks count once. You see the exact price before you pay. A new report after you revise is a new order.
            </p>
            <ul className="mt-3 space-y-1 font-mono text-[12px] text-fg-subtle">
              {reportExamples.map((e) => (
                <li key={e.chars} className="flex justify-between">
                  <span>{e.chars.toLocaleString("en-HK")} chars</span>
                  <span className="text-fg">{formatCredits(e.price)}</span>
                </li>
              ))}
            </ul>
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
              1 credit = HK$1. Larger top-ups get bonus credits: {topUpBonusTiers.slice().reverse().map((t) => `US$${t.minUsd}+ → +${t.percent}%`).join(", ")}. Top up on the Billing & Credits page with crypto (USDT, USDC or BTC) or PayPal. Crypto credits are added automatically once the payment is confirmed; PayPal top-ups are added after we confirm them by hand, then they are yours to spend on any report or refinement.
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
