"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bitcoin, CreditCard, Lock } from "lucide-react";
import { startCryptoPayment, startTopupCheckout, submitTopupClaim } from "@/app/actions/credits";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { WaitingAnimation } from "@/components/ui/waiting";
import { ManualMethod } from "@/components/orders/payment-panel";
import { methodIcons } from "@/components/orders/payment-methods";
import { enabledManualPayments, hkdAmount, isCryptoMethod, type ManualPaymentMethod } from "@/config/payments";
import { CREDITS_PER_USD, formatUSD, reportPrice, topUp, topUpAmountError, topUpBonusPercent, usdToCredits, toCredits } from "@/config/pricing";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

type Tab = ManualPaymentMethod | "card" | "crypto";

export interface CryptoCoin {
  id: string;
  asset: string;
  network: string;
  hint?: string;
  /** The smallest payment NOWPayments takes in this coin, in US dollars (null when unknown). */
  minUsd?: number | null;
}

const DEFAULT_USD = 20;
/** A typical report: 3,000 characters. */
const REPORT_CREDITS = toCredits(reportPrice(3000));
const CRYPTO_PRESETS = topUp.presetsUsd as readonly number[];
const OTHER_PRESETS = topUp.presetsOtherUsd as readonly number[];

/**
 * Buy credits: pick an amount in US dollars (crypto: 10, 20, 100, 200, 500, or any whole
 * amount from US$10; PayPal, Alipay and card: the same plus a US$5 first step), then pay by card, PayPal, Alipay or crypto.
 * Card top-ups are credited automatically; the rest once an admin confirms.
 */
export function TopUpPanel({ stripe, reference, initialUsd, cryptoCoins = [] }: { stripe: boolean; reference: string; initialUsd?: number; cryptoCoins?: CryptoCoin[] }) {
  const router = useRouter();
  const auto = cryptoCoins.length > 0;
  // With automatic crypto (NOWPayments) on, the hand-confirmed crypto tabs are redundant.
  const manual = enabledManualPayments().filter((m) => !(auto && isCryptoMethod(m.id)));
  const tabs: Tab[] = [...(stripe ? (["card"] as const) : []), ...(auto ? (["crypto"] as const) : []), ...manual.map((m) => m.id)];
  const [coin, setCoin] = useState<string>(cryptoCoins[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>(tabs[0] ?? "card");
  const [usd, setUsd] = useState<number | null>(initialUsd && !topUpAmountError(initialUsd) ? initialUsd : DEFAULT_USD);
  const [custom, setCustom] = useState(initialUsd && !CRYPTO_PRESETS.includes(initialUsd) && !topUpAmountError(initialUsd) ? String(initialUsd) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  const crypto = tab === "crypto" || (tab !== "card" && isCryptoMethod(tab));
  const presets = crypto ? CRYPTO_PRESETS : OTHER_PRESETS;
  const isPreset = usd !== null && presets.includes(usd);
  const problem =
    usd === null ? "Enter a whole number of US dollars." : topUpAmountError(usd, crypto) ?? (!crypto && !isPreset ? "Choose one of the amounts above." : null);
  // Each coin has its own floor at NOWPayments; a smaller amount would only fail on the next screen.
  const coinMin = tab === "crypto" ? cryptoCoins.find((c) => c.id === coin)?.minUsd ?? null : null;
  const belowCoinMin = coinMin !== null && usd !== null && usd < Math.ceil(coinMin);
  const credits = usd !== null && !problem ? usdToCredits(usd) : 0;
  const reports = Math.floor(credits / REPORT_CREDITS);
  const current = tab === "card" || tab === "crypto" ? null : manual.find((m) => m.id === tab) ?? null;
  const amountReady = usd !== null && !problem;
  // A method paid in Hong Kong dollars (Alipay) shows the HK$ the customer must send, with the US$ price beside it.
  const hkd = current && amountReady ? hkdAmount(current, usd) : null;

  const pickTab = (t: Tab) => {
    setTab(t);
    setError(null);
    // Custom amounts are for crypto only, and each kind of method has its own smallest amount: fall back to a preset.
    const toCrypto = t === "crypto" || (t !== "card" && isCryptoMethod(t));
    if (usd !== null && (topUpAmountError(usd, toCrypto) || (!toCrypto && !OTHER_PRESETS.includes(usd)))) {
      setUsd(DEFAULT_USD);
      setCustom("");
    }
  };

  if (submitted) {
    return (
      <div>
        <WaitingAnimation
          title="Payment submitted — we're confirming it"
          steps={["Saving your payment details", "Letting our team know", "Adding your credits once it's confirmed"]}
          note="You can leave this page. Your balance updates when the payment is confirmed."
        />
        <Button variant="ghost" size="sm" className="mx-auto mt-2 flex" onClick={() => setSubmitted(false)}>
          Back to top-up
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wide text-fg-subtle">Amount</p>
      <div className={cn("mt-2 grid grid-cols-3 gap-2", presets.length > 5 ? "sm:grid-cols-6" : "sm:grid-cols-5")}>
        {presets.map((n) => {
          const active = usd === n && custom === "";
          return (
            <button
              key={n}
              type="button"
              data-press
              onClick={() => {
                setUsd(n);
                setCustom("");
                setError(null);
              }}
              className={cn(
                "rounded-xl border px-3 py-3 text-center transition",
                active
                  ? "border-accent/50 bg-accent/[0.12] text-fg shadow-[0_0_0_1px_rgb(91_140_255/0.18)]"
                  : "border-[var(--line)] bg-ink-900/40 text-fg-muted hover:border-[var(--line-strong)] hover:text-fg",
              )}
            >
              <span className="block text-[17px] font-semibold tracking-tight">{n}U</span>
              <span className="block font-mono text-[10.5px] text-fg-subtle">{usdToCredits(n).toLocaleString("en-US")} cr</span>
              {topUpBonusPercent(n) > 0 && <span className="mt-0.5 block text-[10.5px] font-medium text-ok">+{topUpBonusPercent(n)}% bonus</span>}
            </button>
          );
        })}
      </div>

      {crypto && (
        <label className="mt-3 block">
          <span className="text-[12px] text-fg-subtle">Or enter your own amount (crypto only, minimum {formatUSD(topUp.minUsd)})</span>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-[var(--line)] bg-ink-900/40 px-3 focus-within:border-accent/50">
            <span className="text-fg-subtle">US$</span>
            <input
              inputMode="numeric"
              value={custom}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "").slice(0, 5);
                setCustom(v);
                setUsd(v === "" ? null : Number(v));
                setError(null);
              }}
              placeholder="e.g. 50"
              className="w-full bg-transparent py-2.5 text-[15px] outline-none placeholder:text-fg-subtle"
              aria-label="Custom amount in US dollars"
            />
          </div>
        </label>
      )}

      <p className="mt-3 text-[13px] text-fg-muted">
        {problem && custom !== "" ? (
          <span className="text-warn">{problem}</span>
        ) : credits > 0 ? (
          <>
            {formatUSD(usd!)} adds <span className="font-semibold text-fg">{credits.toLocaleString("en-US")} credits</span>
            {topUpBonusPercent(usd!) > 0 && <> (includes {(credits - usd! * CREDITS_PER_USD).toLocaleString("en-US")} bonus credits)</>}
            {reports > 0 && <> · about {reports} {reports === 1 ? "report" : "reports"} of 3,000 characters</>}
          </>
        ) : (
          "Choose an amount."
        )}
      </p>

      <p className="mt-6 text-[12px] font-medium uppercase tracking-wide text-fg-subtle">Pay with</p>
      {tabs.length > 0 ? (
        <div role="tablist" aria-label="Payment method" className="mt-2 flex flex-wrap gap-1.5 rounded-2xl border border-[var(--line)] bg-ink-900/50 p-1.5">
          {tabs.map((t) => {
            const Icon = t === "crypto" ? Bitcoin : methodIcons[t];
            const label = t === "card" ? "Card / Google Pay" : t === "crypto" ? "Crypto · USDT / USDC / BTC" : manual.find((m) => m.id === t)?.label;
            const active = t === tab;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                data-press
                aria-selected={active}
                onClick={() => pickTab(t)}
                className={cn(
                  "relative flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-[13px] font-medium transition",
                  active ? "text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="topup-tab"
                    className="absolute inset-0 rounded-xl border border-accent/40 bg-accent/[0.12] shadow-[0_0_0_1px_rgb(91_140_255/0.15),0_10px_30px_-12px_rgb(91_140_255/0.7)]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon className="relative size-4" aria-hidden />
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-2">
          <FormMessage tone="info">Crypto payment (USDT, USDC, BTC) is being set up. Please check back soon.</FormMessage>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          role="tabpanel"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5"
        >
          {current ? (
            <ManualMethod
              key={`${current.id}-${usd}`}
              method={current}
              amountLabel={!amountReady ? "Choose an amount" : hkd !== null ? `HK$${hkd.toLocaleString("en-HK")}` : formatUSD(usd)}
              amountCopy={!amountReady ? "" : hkd !== null ? String(hkd) : String(usd)}
              amountSub={amountReady && hkd !== null ? `= ${formatUSD(usd)}` : undefined}
              reference={reference}
              disabled={pending || Boolean(problem)}
              submit={(m, ref) => submitTopupClaim(usd ?? 0, m, ref)}
              onSubmitted={() => {
                track("topup_claim_submitted", { method: current.id });
                setSubmitted(true);
                router.refresh();
              }}
            />
          ) : stripe && tab === "card" ? (
            <div className="rounded-2xl border border-[var(--line)] bg-ink-900/40 p-5 text-center">
              <p className="text-[13px] text-fg-muted">
                Pay by Visa, Mastercard, Google Pay, Apple Pay and other cards through Stripe&rsquo;s secure checkout, in US dollars. Credits are added automatically once the payment clears.
              </p>
              <Button
                size="lg"
                className="mt-4 w-full"
                loading={pending}
                disabled={pending || Boolean(problem) || usd === null}
                onClick={() => {
                  setError(null);
                  track("topup_checkout_started");
                  start(async () => {
                    const res = await startTopupCheckout(usd ?? 0);
                    if (res && !res.ok) setError(res.message);
                  });
                }}
              >
                <CreditCard className="size-4" /> {usd !== null && !problem ? `Pay ${formatUSD(usd)} by card or Google Pay` : "Choose an amount"}
              </Button>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-[11.5px] text-fg-subtle">
                <Lock className="size-3" /> Secure checkout by Stripe
              </p>
            </div>
          ) : tab === "crypto" ? (
            <div className="rounded-2xl border border-[var(--line)] bg-ink-900/40 p-5">
              <p className="text-[13px] text-fg-muted">
                Pay with USDT, USDC or Bitcoin. Choose the coin and network your wallet will send on; you&rsquo;ll get an exact amount and address on the next screen, and your credits are added automatically once the payment is confirmed.
              </p>
              <p className="mt-4 text-[12px] font-medium uppercase tracking-wide text-fg-subtle">Coin and network</p>
              <div role="radiogroup" aria-label="Coin and network" className="mt-2 grid gap-2 sm:grid-cols-2">
                {cryptoCoins.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={coin === c.id}
                    data-press
                    onClick={() => setCoin(c.id)}
                    className={cn(
                      "rounded-xl border px-3.5 py-2.5 text-left transition",
                      coin === c.id ? "border-accent/50 bg-accent/[0.12] text-fg" : "border-[var(--line)] bg-ink-900/40 text-fg-muted hover:border-[var(--line-strong)] hover:text-fg",
                    )}
                  >
                    <span className="block text-[14px] font-semibold">{c.asset}</span>
                    <span className="block text-[12px] text-fg-subtle">{c.network}{c.hint ? ` · ${c.hint}` : ""}</span>
                    {c.minUsd ? <span className="mt-0.5 block font-mono text-[10.5px] text-fg-subtle">from {formatUSD(Math.ceil(c.minUsd))}</span> : null}
                  </button>
                ))}
              </div>
              {belowCoinMin && coinMin !== null && (
                <p className="mt-4 text-[12.5px] text-warn">
                  The smallest payment in this coin is about {formatUSD(Math.ceil(coinMin))}. Choose {formatUSD(Math.ceil(coinMin))} or more, or pick a coin with a lower minimum.
                </p>
              )}
              <Button
                size="lg"
                className="mt-5 w-full"
                loading={pending}
                disabled={pending || Boolean(problem) || usd === null || !coin || belowCoinMin}
                onClick={() => {
                  setError(null);
                  track("crypto_payment_started", { coin });
                  start(async () => {
                    const res = await startCryptoPayment(usd ?? 0, coin);
                    if (res.ok) router.push(`/billing/crypto/${res.id}`);
                    else setError(res.message);
                  });
                }}
              >
                <Bitcoin className="size-4" /> {usd !== null && !problem ? `Pay ${formatUSD(usd)} with crypto` : "Choose an amount"}
              </Button>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-[11.5px] text-fg-subtle">
                <Lock className="size-3" /> Payments are processed by NOWPayments
              </p>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="mt-4">
        <FormMessage>{error}</FormMessage>
      </div>
    </div>
  );
}
