import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingView } from "@/components/billing/billing-view";
import { TopUpPanel } from "@/components/billing/top-up-panel";
import { requireUser } from "@/lib/auth/session";
import { getCreditBalance, listCreditTopups, listCreditTransactions } from "@/lib/credits";
import { topupReference } from "@/config/payments";
import { availableCoins, coinMinimums, isNowPaymentsConfigured } from "@/lib/payments/nowpayments";
import { topUp } from "@/config/pricing";
import { createClient } from "@/lib/supabase/server";
import { markedFake } from "@/lib/payments/pay-first";

export const metadata: Metadata = { title: "Billing & Credits" };

async function getCryptoCoins() {
  const coinList = isNowPaymentsConfigured() ? await availableCoins() : [];
  const mins = await coinMinimums(coinList);
  // Cheapest coin first, so the pre-selected one accepts the smallest top-up.
  return coinList
    .map((c) => ({ ...c, minUsd: mins[c.id] ?? null }))
    .sort((a, b) => (a.minUsd ?? Infinity) - (b.minUsd ?? Infinity));
}

async function TopUpMethods({ userId, initialUsd }: { userId: string; initialUsd?: number }) {
  const [cryptoCoins, fakeClaim] = await Promise.all([getCryptoCoins(), markedFake(userId)]);
  return <TopUpPanel instantCredit={!fakeClaim} stripe={false} reference={topupReference(userId)} initialUsd={initialUsd} cryptoCoins={cryptoCoins} />;
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/billing");
  const supabase = await createClient();
  const [sp, balance, topups, txs, { data: cryptoRows }] = await Promise.all([
    searchParams,
    getCreditBalance(),
    listCreditTopups(),
    listCreditTransactions(),
    supabase.from("crypto_payments").select("id,topup_id,status").order("created_at", { ascending: false }).limit(50),
  ]);
  const cryptoByTopup = new Map((cryptoRows ?? []).map((r) => [r.topup_id as string, r.id as string]));
  const need = Number(Array.isArray(sp.need) ? sp.need[0] : sp.need);
  const initialUsd = Number.isInteger(need) && need >= topUp.minUsd && need <= topUp.maxUsd ? need : undefined;
  const checkout = Array.isArray(sp.checkout) ? sp.checkout[0] : sp.checkout;

  return (
    <BillingView
      balance={balance}
      topups={topups}
      txs={txs}
      cryptoByTopup={cryptoByTopup}
      checkout={checkout}
      topUp={
        <Suspense fallback={<p role="status" className="text-sm text-fg-muted">Loading payment methods…</p>}>
          <TopUpMethods userId={user.id} initialUsd={initialUsd} />
        </Suspense>
      }
    />
  );
}
