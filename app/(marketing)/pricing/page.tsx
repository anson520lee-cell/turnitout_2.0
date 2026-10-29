import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PricingCards } from "@/components/landing/pricing-cards";
import { Container } from "@/components/ui/section";
import { FaqList } from "@/components/landing/faq-list";
import { faq } from "@/config/faq";
import { freeReport } from "@/config/app";
import { formatCredits, reportPrice, reportPricing, rewritePricing, topUpBonusTiers } from "@/config/pricing";
import { reportCycleLabel, reportMinimumLabel, reportRangeLabel, reportRateLabel } from "@/config/services";

export const metadata: Metadata = {
  title: "Pricing",
  description: `AI-writing risk reports, ${reportRateLabel}, with one free every day. Prices are in credits (1 credit = HK$1).`,
  alternates: { canonical: "/pricing" },
};

const reportExamples = [1500, 3000, 8000, 20000, 28000, 50000, 100000].map((chars) => ({ chars, price: reportPrice(chars) }));

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Start free. Pay only for what you check."
        body={`Every account gets ${freeReport.dailyLimit} full report a day free (up to ${freeReport.maxChars.toLocaleString("en-HK")} characters). Longer texts: the AI-writing risk report is priced by length.`}
      />
      <Container>
        <PricingCards headingAs="h2" />

        <div className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-2">
          <div data-tilt="5" className="glass rounded-2xl p-6 text-[14px] leading-relaxed text-fg-muted">
            <h2 className="text-[15px] font-semibold text-fg">How reports are priced</h2>
            <p className="mt-2">
              {reportRateLabel}, rounded up to the next {reportPricing.blockChars.toLocaleString("en-HK")}. {reportMinimumLabel}. {reportCycleLabel}. For texts of {reportRangeLabel}. Spaces count; runs of
              spaces and line breaks count once. You see the exact price before you pay, and you can pay just that one report by Alipay (no top-up, no minimum) or use credits. A new report after you revise is a new order.
            </p>
            <p className="mt-2">
              <span className="font-medium text-fg">Writing Refinement</span> is an optional add-on after a finished report: it rewrites each flagged sentence to bring the AI score down, re-checked by the same detector, with what still reads as AI rewritten again. A suggestion may change what a sentence says (numbers, names, quotations and citations are kept), and you choose which to use. It costs {rewritePricing.multiple} times the price of that report and is charged only when suggestions are made. It does not change your report and does not guarantee any result in any checker.
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
            <h2 className="text-[15px] font-semibold text-fg">How credits work</h2>
            <p className="mt-2">
              1 credit = HK$1. Larger top-ups get bonus credits: {topUpBonusTiers.slice().reverse().map((t) => `US$${t.minUsd}+ → +${t.percent}%`).join(", ")}. Top up on the Billing & Credits page with crypto (USDT, USDC or BTC), PayPal or Alipay. Crypto credits are added automatically once the payment is confirmed; Alipay top-ups are added as soon as you send the transaction number (we check the payment afterwards), PayPal top-ups after we confirm them by hand, then they are yours to spend on any report.
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
