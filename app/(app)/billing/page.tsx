import type { Metadata } from "next";
import { Coins } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormMessage } from "@/components/ui/field";
import { TopUpPanel } from "@/components/billing/top-up-panel";
import { requireUser } from "@/lib/auth/session";
import { getCreditBalance, listCreditTopups, listCreditTransactions, type CreditTopup } from "@/lib/credits";
import { topupReference } from "@/config/payments";
import { availableCoins, isNowPaymentsConfigured } from "@/lib/payments/nowpayments";
import { CREDITS_PER_USD, formatUSD, screeningPrices, refinementPricing, toCredits, topUp } from "@/config/pricing";
import { formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const metadata: Metadata = { title: "Billing & Credits" };

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

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/billing");
  const sp = await searchParams;
  const [balance, topups, txs] = await Promise.all([getCreditBalance(), listCreditTopups(), listCreditTransactions()]);
  const { data: cryptoRows } = await (await createClient()).from("crypto_payments").select("id,topup_id,status").order("created_at", { ascending: false }).limit(50);
  const cryptoByTopup = new Map((cryptoRows ?? []).map((r) => [r.topup_id as string, r.id as string]));
  const cryptoCoins = isNowPaymentsConfigured() ? await availableCoins() : [];
  const need = Number(Array.isArray(sp.need) ? sp.need[0] : sp.need);
  const initialUsd = Number.isInteger(need) && need >= topUp.minUsd && need <= topUp.maxUsd ? need : undefined;
  const reportCredits = toCredits(screeningPrices.combined_screening);
  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <>
      <AppHeader title="Billing & Credits" body="Top up your credits and see where they go." />

      {sp.checkout === "success" && (
        <div className="mb-5"><FormMessage tone="success">Payment received. Your credits are added as soon as the payment is confirmed (usually a few seconds).</FormMessage></div>
      )}
      {sp.checkout === "cancelled" && (
        <div className="mb-5"><FormMessage tone="info">Checkout was cancelled. You haven&rsquo;t been charged.</FormMessage></div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <div className="space-y-5">
          <Card strong className="noise relative overflow-hidden p-5 sm:p-6">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent/20 blur-3xl" />
            <p className="relative flex items-center gap-2 text-[12.5px] text-fg-muted">
              <Coins className="size-4 text-accent" aria-hidden /> Credit balance
            </p>
            <p className="relative mt-2 text-gradient text-5xl font-semibold tracking-tight">{n(balance)}</p>
            <p className="relative mt-1 text-[12.5px] text-fg-subtle">
              credits · about {Math.floor(balance / reportCredits)} reports
            </p>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold">What credits buy</h2>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-fg-muted">
              <li>One Turnitin report: {reportCredits} credits (about {formatUSD(Math.round((reportCredits / CREDITS_PER_USD) * 100) / 100)}).</li>
              <li>Writing Refinement: {refinementPricing.perBlock / 100} credit per {refinementPricing.blockChars} characters, minimum {toCredits(refinementPricing.minimum)} credits.</li>
              <li>Rate: {formatUSD(1)} = {CREDITS_PER_USD} credits. Credits don&rsquo;t expire.</li>
            </ul>
          </Card>
        </div>

        <Card strong className="p-5 sm:p-6">
          <h2 className="text-[15px] font-semibold">Top up</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Choose an amount and how to pay. Prices are in US dollars or crypto.</p>
          <div className="mt-5">
            <TopUpPanel stripe={false} reference={topupReference(user.id)} initialUsd={initialUsd} cryptoCoins={cryptoCoins} />
          </div>
        </Card>
      </div>

      {topups.length > 0 && (
        <Card className="mt-5 p-5 sm:p-6">
          <h2 className="text-[15px] font-semibold">Top-ups</h2>
          <ul className="mt-3 divide-y divide-[var(--line)] text-[13px]">
            {topups.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>
                  {formatUSD(t.usd)} <span className="text-fg-subtle">→ {n(t.amount)} credits · {t.method === "nowpayments" ? "crypto" : t.method.replace(/_/g, " ")}</span>
                  <span className="block text-[12px] text-fg-subtle">{formatDateTime(t.created_at)}{t.admin_note ? ` · ${t.admin_note}` : ""}</span>
                </span>
                <span className="flex items-center gap-2">
                  {cryptoByTopup.has(t.id) && (
                    <Link href={`/billing/crypto/${cryptoByTopup.get(t.id)}`} className="text-[12.5px] text-accent hover:underline">View payment</Link>
                  )}
                  <Badge tone={statusTone[t.status]}>{statusLabel[t.status]}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-5 p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold">History</h2>
        {txs.length === 0 ? (
          <p className="mt-3 text-[13px] text-fg-muted">No credit activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--line)] text-[13px]">
            {txs.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  {kindLabel[t.kind]}
                  <span className="block text-[12px] text-fg-subtle">{formatDateTime(t.created_at)}{t.note ? ` · ${t.note}` : ""}</span>
                </span>
                <span className="text-right">
                  <span className={t.delta >= 0 ? "text-success" : "text-fg"}>{t.delta >= 0 ? "+" : ""}{n(t.delta)}</span>
                  <span className="block text-[12px] text-fg-subtle">balance {n(t.balance_after)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
