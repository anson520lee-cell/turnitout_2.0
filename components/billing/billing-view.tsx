import type { ReactNode } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormMessage } from "@/components/ui/field";
import type { CreditTopup, CreditTransaction } from "@/lib/credits";
import { paymentMethodLabel } from "@/config/payments";
import { CREDITS_PER_USD, formatUSD, reportPrice, toCredits, topUpBonusTiers } from "@/config/pricing";
import { reportMinimumLabel, reportRateLabel } from "@/config/services";
import { formatDateTime } from "@/lib/utils";

const statusTone: Record<CreditTopup["status"], "warn" | "success" | "danger" | "neutral"> = {
  awaiting_payment: "neutral",
  pending: "warn",
  confirmed: "success",
  rejected: "danger",
  cancelled: "neutral",
};
const statusLabel: Record<CreditTopup["status"], string> = {
  awaiting_payment: "Awaiting payment",
  pending: "Confirming",
  confirmed: "Added",
  rejected: "Not matched",
  cancelled: "Cancelled",
};
const kindLabel = { topup: "Top-up", spend: "Order payment", refund: "Refund", adjustment: "Adjustment" } as const;
const n = (v: number) => v.toLocaleString("en-US");

/**
 * Billing & Credits. Takes plain data, with the top-up form passed in, so the
 * real page and the design preview render the same thing. The balance is one
 * large figure on a hairline; the history is a ruled list. The top-up form
 * itself stays plain and quick: no entrance, nothing in its way.
 */
export function BillingView({
  balance,
  topups,
  txs,
  cryptoByTopup,
  checkout,
  topUp,
}: {
  balance: number;
  topups: CreditTopup[];
  txs: CreditTransaction[];
  /** Top-up id → crypto payment id, for the "View payment" links. */
  cryptoByTopup: Map<string, string>;
  checkout?: string;
  topUp: ReactNode;
}) {
  const reportCredits = toCredits(reportPrice(3000));
  return (
    <>
      <AppHeader title="Billing & Credits" body="Top up your credits and see where they go." />

      {checkout === "success" && (
        <div className="mb-5">
          <FormMessage tone="success">Payment received. Your credits are added as soon as the payment is confirmed (usually a few seconds).</FormMessage>
        </div>
      )}
      {checkout === "cancelled" && (
        <div className="mb-5">
          <FormMessage tone="info">Checkout was cancelled. You haven&rsquo;t been charged.</FormMessage>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <div className="space-y-5">
          <Card strong className="p-5 sm:p-6">
            <p className="app-k">
              <span className="nav-idx">01</span> Credit balance
            </p>
            <p className="app-figure mt-3">{n(balance)}</p>
            <p className="mt-1 text-[12.5px] text-fg-subtle">credits · about {Math.floor(balance / reportCredits)} reports</p>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="app-k">
              <span className="nav-idx">02</span> What credits buy
            </h2>
            <ul className="app-points mt-4 text-[13px] leading-relaxed text-fg-muted">
              <li>
                AI-writing risk report: {reportRateLabel.toLowerCase()}, {reportMinimumLabel.toLowerCase()}; in every 20,000 characters the first 8,000 are charged and the next 12,000 are free, up to
                100,000 characters. A 3,000-character text is {reportCredits} credits (about {formatUSD(Math.round((reportCredits / CREDITS_PER_USD) * 100) / 100)}).
              </li>
              <li>Rate: {formatUSD(1)} = {CREDITS_PER_USD} credits. Credits don&rsquo;t expire.</li>
              <li>
                Bonus credits on larger top-ups: {topUpBonusTiers.slice().reverse().map((t) => `${formatUSD(t.minUsd)}+ → +${t.percent}%`).join(", ")}. Bonus credits are not refundable as money.
              </li>
            </ul>
          </Card>
        </div>

        <Card strong className="app-plain p-5 sm:p-6">
          <h2 className="app-k">
            <span className="nav-idx">03</span> Top up
          </h2>
          <p className="mt-2 text-[13px] text-fg-muted">Choose an amount and how to pay. Prices are in US dollars; Alipay is paid in Hong Kong dollars at the same value.</p>
          <div className="mt-5">{topUp}</div>
        </Card>
      </div>

      {topups.length > 0 && (
        <section className="mt-10" aria-labelledby="topups">
          <div className="app-section-head">
            <h2 id="topups" className="app-section-title">
              Top-ups
            </h2>
          </div>
          <ul className="app-list text-[13px]">
            {topups.map((t) => (
              <li key={t.id} className="app-row app-row-static">
                <span className="min-w-0 flex-1">
                  {formatUSD(t.usd)}{" "}
                  <span className="text-fg-subtle">
                    → {n(t.amount)} credits · {t.method === "nowpayments" ? "Crypto" : paymentMethodLabel(t.method)}
                  </span>
                  <span className="block text-[12px] text-fg-subtle">
                    {formatDateTime(t.created_at)}
                    {t.admin_note ? ` · ${t.admin_note}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {cryptoByTopup.has(t.id) && (
                    <Link href={`/billing/crypto/${cryptoByTopup.get(t.id)}`} className="link-line text-[12.5px] text-accent">
                      View payment
                    </Link>
                  )}
                  <Badge tone={statusTone[t.status]}>{statusLabel[t.status]}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-labelledby="history">
        <div className="app-section-head">
          <h2 id="history" className="app-section-title">
            History
          </h2>
        </div>
        {txs.length === 0 ? (
          <p className="mt-4 text-[13px] text-fg-muted">No credit activity yet.</p>
        ) : (
          <ul className="app-list text-[13px]">
            {txs.map((t) => (
              <li key={t.id} className="app-row app-row-static">
                <span className="min-w-0 flex-1">
                  {kindLabel[t.kind]}
                  <span className="block text-[12px] text-fg-subtle">
                    {formatDateTime(t.created_at)}
                    {t.note ? ` · ${t.note}` : ""}
                  </span>
                </span>
                <span className="text-right font-mono">
                  <span className={t.delta >= 0 ? "text-accent" : "text-fg"}>
                    {t.delta >= 0 ? "+" : ""}
                    {n(t.delta)}
                  </span>
                  <span className="block text-[11.5px] text-fg-subtle">balance {n(t.balance_after)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
