"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CreditCard, Lock } from "lucide-react";
import { startTopupCheckout, submitTopupClaim } from "@/app/actions/credits";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { WaitingAnimation } from "@/components/ui/waiting";
import { ManualMethod } from "@/components/orders/payment-panel";
import { methodIcons } from "@/components/orders/payment-methods";
import { enabledManualPayments, isCryptoMethod, type ManualPaymentMethod } from "@/config/payments";
import { formatUSD, screeningPrices, topUp, topUpAmountError, usdToCredits, toCredits } from "@/config/pricing";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

type Tab = ManualPaymentMethod | "card";

const DEFAULT_USD = 20;
const REPORT_CREDITS = toCredits(screeningPrices.combined_screening);
const PRESETS = topUp.presetsUsd as readonly number[];

/**
 * Buy credits: pick an amount in US dollars (5, 20, 100, 200, 500; crypto
 * accepts any whole amount from US$5), then pay by card, PayPal or crypto.
 * Card top-ups are credited automatically; the rest once an admin confirms.
 */
export function TopUpPanel({
  stripe,
  reference,
  initialUsd,
  stableOffset,
}: {
  stripe: boolean;
  reference: string;
  initialUsd?: number;
  /** Thousandths of a dollar this account adds to stablecoin payments, so they can be matched and credited automatically. */
  stableOffset: number;
}) {
  const router = useRouter();
  const manual = enabledManualPayments();
  const tabs: Tab[] = [...(stripe ? (["card"] as const) : []), ...manual.map((m) => m.id)];
  const [tab, setTab] = useState<Tab>(tabs[0] ?? "card");
  const [usd, setUsd] = useState<number | null>(initialUsd && !topUpAmountError(initialUsd) ? initialUsd : DEFAULT_USD);
  const [custom, setCustom] = useState(initialUsd && !PRESETS.includes(initialUsd) && !topUpAmountError(initialUsd) ? String(initialUsd) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [credited, setCredited] = useState(false);

  const crypto = tab !== "card" && isCryptoMethod(tab);
  const isPreset = usd !== null && PRESETS.includes(usd);
  const problem =
    usd === null ? "Enter a whole number of US dollars." : topUpAmountError(usd) ?? (!crypto && !isPreset ? "Choose one of the amounts above." : null);
  const credits = usd !== null && !problem ? usdToCredits(usd) : 0;
  const reports = Math.floor(credits / REPORT_CREDITS);
  const current = tab === "card" ? null : manual.find((m) => m.id === tab) ?? null;
  // USDT and USDC are matched on chain by an exact amount: the dollars plus this account's thousandths
  const stable = tab === "usdt" || tab === "usdc";
  const exact = usd !== null ? (usd + stableOffset / 1000).toFixed(3) : "";

  const pickTab = (t: Tab) => {
    setTab(t);
    setError(null);
    // Custom amounts are for crypto only; other methods fall back to a preset.
    if (!(t !== "card" && isCryptoMethod(t)) && usd !== null && !PRESETS.includes(usd)) {
      setUsd(DEFAULT_USD);
      setCustom("");
    }
  };

  if (credited) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok/[0.06] p-6 text-center">
        <p className="text-[16px] font-semibold text-fg">Payment confirmed on chain</p>
        <p className="mt-1.5 text-[13.5px] text-fg-muted">Your credits have been added. They&rsquo;re in your balance now.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <WaitingAnimation
        title="Payment submitted — we're confirming it"
        steps={["Saving your payment details", "Letting our team know", "Adding your credits once it's confirmed"]}
        note="You can leave this page. Your balance updates when the payment is confirmed."
      />
    );
  }

  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wide text-fg-subtle">Amount</p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {topUp.presetsUsd.map((n) => {
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
            {reports > 0 && <> · about {reports} {reports === 1 ? "report" : "reports"}</>}
          </>
        ) : (
          "Choose an amount."
        )}
      </p>

      <p className="mt-6 text-[12px] font-medium uppercase tracking-wide text-fg-subtle">Pay with</p>
      {tabs.length > 0 ? (
        <div role="tablist" aria-label="Payment method" className="mt-2 flex flex-wrap gap-1.5 rounded-2xl border border-[var(--line)] bg-ink-900/50 p-1.5">
          {tabs.map((t) => {
            const Icon = methodIcons[t];
            const label = t === "card" ? "Card / Google Pay" : manual.find((m) => m.id === t)?.label;
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
          <FormMessage tone="info">Payment isn&rsquo;t set up yet. Please contact support to top up.</FormMessage>
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
              amountLabel={
                usd !== null && !problem
                  ? stable
                    ? `${exact} ${current.label} (exactly)`
                    : formatUSD(usd)
                  : "Choose an amount"
              }
              amountCopy={usd !== null && !problem ? (stable ? exact : String(usd)) : ""}
              reference={reference}
              disabled={pending || Boolean(problem)}
              submit={(m, ref) =>
                submitTopupClaim(usd ?? 0, m, ref).then((r) => {
                  if (r.ok && r.credited) setCredited(true);
                  return r;
                })
              }
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
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="mt-4">
        <FormMessage>{error}</FormMessage>
      </div>
    </div>
  );
}
