import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/section";
import { CryptoPaymentView, type CryptoPaymentData } from "@/components/billing/crypto-payment-view";
import { TopUpPanel } from "@/components/billing/top-up-panel";
import { Card } from "@/components/ui/card";
import { COINS, NP_STATUSES, type NpStatus } from "@/lib/payments/nowpayments/core";
import { paymentUri, qrDataUrl } from "@/lib/payments/nowpayments/qr";

/**
 * Design-review page, not part of the product: shows the crypto payment
 * screen in each status with made-up data, so it can be looked at without a
 * NOWPayments account. Not linked anywhere; open it by its address.
 * Example: /preview/crypto-payment?state=partially_paid&coin=usdttrc20
 */
export const metadata = { robots: { index: false, follow: false } };

const SAMPLE: Record<string, { addr: string; amount: number; network: string }> = {
  usdttrc20: { addr: "TXyZ8mP4qL2vN9kR7sD3wF6hJ1bC5aGe9T", amount: 20.37, network: "TRON (TRC20)" },
  usdcerc20: { addr: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", amount: 20.42, network: "Ethereum (ERC20)" },
  btc: { addr: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", amount: 0.00031842, network: "Bitcoin" },
};

export default async function CryptoPreview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const status = (NP_STATUSES as readonly string[]).includes(sp.state ?? "") ? (sp.state as NpStatus) : "waiting";
  const coin = sp.coin && SAMPLE[sp.coin] ? sp.coin : "usdttrc20";
  const s = SAMPLE[coin];
  if (!s) notFound();
  const data: CryptoPaymentData = {
    id: "00000000-0000-4000-8000-000000000001",
    usd: 20,
    pay_currency: coin,
    network: s.network,
    pay_amount: s.amount,
    actually_paid: status === "partially_paid" ? Number((s.amount * 0.95).toFixed(8)) : PAID.includes(status) ? s.amount : null,
    pay_address: s.addr,
    status,
    expires_at: at(17 * 60_000 + 42_000),
    created_at: at(-3 * 60_000),
    paid_at: PAID.includes(status) ? at(0) : null,
    np_payment_id: "5745459419",
  };
  const qr = await qrDataUrl(paymentUri(coin, s.addr, s.amount));
  return (
    <div className="py-14 sm:py-20">
      <Container className="max-w-3xl space-y-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Design preview · sample data, not a real payment</p>
        <div className="flex flex-wrap gap-1.5 text-[12px]">
          {NP_STATUSES.map((st) => (
            <Link key={st} href={`?state=${st}&coin=${coin}`} className={`rounded-full border px-3 py-1 ${st === status ? "border-accent/60 bg-accent/15" : "border-[var(--line)] text-fg-muted"}`}>
              {st}
            </Link>
          ))}
        </div>
        {sp.view === "checkout" ? (
          <Card strong className="p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold">Top up</h2>
            <div className="mt-5"><TopUpPanel stripe={false} reference="ZP-SAMPLE01" cryptoCoins={[...COINS]} /></div>
          </Card>
        ) : (
          <CryptoPaymentView initial={data} qr={qr} poll={false} />
        )}
      </Container>
    </div>
  );
}

const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const PAID: NpStatus[] = ["confirmed", "sending", "finished"];
