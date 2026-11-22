import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PricingCards } from "@/components/landing/pricing-cards";
import { Container } from "@/components/ui/section";
import { Build } from "@/components/motion/reveal";
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
const maxExample = Math.max(...reportExamples.map((e) => e.price));

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Start free."
        outline="Pay only for what you check."
        body={`Every account gets ${freeReport.dailyLimit} full report a day free (up to ${freeReport.maxChars.toLocaleString("en-HK")} characters). Longer texts: the AI-writing risk report is priced by length.`}
      />
      <Container>
        <PricingCards headingAs="h2" />

        <div className="mx-auto mt-16 grid max-w-5xl gap-5 md:grid-cols-2">
          <Build r={20}>
            <div data-tilt="" className="doc-card glass h-full rounded-[20px]">
              <p className="doc-card-label">
                <span className="nav-idx">01</span> Reports
              </p>
              <h2 className="doc-card-title">How reports are priced</h2>
              <p className="mt-3">
                {reportRateLabel}, rounded up to the next {reportPricing.blockChars.toLocaleString("en-HK")}. {reportMinimumLabel}. {reportCycleLabel}. For texts of {reportRangeLabel}. Spaces count; runs of
                spaces and line breaks count once. You see the exact price before you pay, and you can pay just that one report by Alipay (no top-up, no minimum) or use credits. A new report after you revise is a new order.
              </p>
              <p className="mt-3">
                <span className="font-medium text-fg">Writing Refinement</span> is an optional add-on after a finished report: it rewrites each flagged sentence to bring the AI score down, re-checked by the same detector, with what still reads as AI rewritten again. A suggestion may change what a sentence says (numbers, names, quotations and citations are kept), and you choose which to use. It costs {rewritePricing.multiple} times the price of that report and is charged only when suggestions are made. It does not change your report and does not guarantee any result in any checker.
              </p>
              <table className="price-table mt-5">
                <caption className="sr-only">Example report prices by length</caption>
                <tbody>
                  {reportExamples.map((e) => (
                    <tr key={e.chars}>
                      <th scope="row">{e.chars.toLocaleString("en-HK")} chars</th>
                      <td aria-hidden className="price-table-bar">
                        <i style={{ "--w": (e.price / maxExample).toFixed(3) } as CSSProperties} />
                      </td>
                      <td>{formatCredits(e.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Build>
          <Build r={20}>
            <div data-tilt="" className="doc-card glass h-full rounded-[20px]">
              <p className="doc-card-label">
                <span className="nav-idx">02</span> Credits
              </p>
              <h2 className="doc-card-title">How credits work</h2>
              <p className="mt-3">
                1 credit = HK$1. Larger top-ups get bonus credits: {topUpBonusTiers.slice().reverse().map((t) => `US$${t.minUsd}+ → +${t.percent}%`).join(", ")}. Top up on the Billing & Credits page with crypto (USDT, USDC or BTC), PayPal or Alipay. Crypto credits are added automatically once the payment is confirmed; Alipay top-ups are added as soon as you send the transaction number (we check the payment afterwards), PayPal top-ups after we confirm them by hand, then they are yours to spend on any report.
              </p>
            </div>
          </Build>
        </div>

        <div className="mx-auto mt-16 max-w-3xl">
          <FaqList items={faq.filter((f) => /guarantee|difference|include|cost|credits|\bpay\b/i.test(f.q))} />
        </div>
      </Container>
    </>
  );
}
