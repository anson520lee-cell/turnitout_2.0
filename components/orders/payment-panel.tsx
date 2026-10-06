"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CreditCard, ExternalLink, Lock, QrCode } from "lucide-react";
import { startCheckout, devMarkPaid, cancelUnpaidOrder, submitPaymentClaim } from "@/app/actions/orders";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { WaitingAnimation } from "@/components/ui/waiting";
import { methodIcons } from "./payment-methods";
import { CopyValue } from "./copy-value";
import {
  claimReference,
  acceptsClaims,
  enabledManualPayments,
  isPlaceholder,
  type ManualPaymentConfig,
  type ManualPaymentMethod,
} from "@/config/payments";
import { formatHKD } from "@/config/pricing";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

type Tab = ManualPaymentMethod | "card";

/** The payee's QR image in a lit frame, or a tidy placeholder when the image isn't there yet. */
function QrFrame({ method }: { method: ManualPaymentConfig }) {
  const [failed, setFailed] = useState(false);
  const show = method.qrImage && !failed;
  return (
    <div data-tilt="10" className="glass-strong relative mx-auto w-[184px] self-start rounded-2xl p-3.5">
      <div data-pop className="relative aspect-square overflow-hidden rounded-xl bg-white/[0.03]">
        {show ? (
          <>
            <Image
              src={method.qrImage!}
              alt={`${method.label} QR code`}
              width={320}
              height={320}
              unoptimized
              onError={() => setFailed(true)}
              className="size-full rounded-xl bg-white object-contain p-2"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-cyan/15 to-cyan/50 motion-safe:animate-scan [--scan-distance:520%]"
            />
          </>
        ) : (
          <div className="grid size-full place-items-center bg-[radial-gradient(rgb(148_163_255/0.14)_1px,transparent_1.2px)] [background-size:10px_10px] text-center">
            <div className="rounded-xl bg-ink-900/85 px-3 py-2.5 backdrop-blur-sm">
              <QrCode className="mx-auto size-7 text-fg-subtle" aria-hidden />
              <p className="mt-1.5 text-[11px] leading-snug text-fg-muted">Use the details<br />shown here</p>
            </div>
          </div>
        )}
        {/* corner markers */}
        {["left-1.5 top-1.5 border-l-2 border-t-2", "right-1.5 top-1.5 border-r-2 border-t-2", "bottom-1.5 left-1.5 border-b-2 border-l-2", "bottom-1.5 right-1.5 border-b-2 border-r-2"].map((c) => (
          <span key={c} aria-hidden className={cn("absolute size-5 rounded-[5px] border-accent/80", c)} />
        ))}
      </div>
      <p className="mt-2.5 text-center text-[11.5px] text-fg-muted">{show ? `Scan with ${method.label}` : `${method.label} · no QR code`}</p>
    </div>
  );
}

function ManualMethod({
  orderId,
  method,
  amount,
  reference,
  disabled,
  onSubmitted,
}: {
  orderId: string;
  method: ManualPaymentConfig;
  amount: number;
  reference: string;
  disabled: boolean;
  onSubmitted: () => void;
}) {
  const [payer, setPayer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const linkReady = method.link && !isPlaceholder(method.link) && /^https?:\/\//.test(method.link);
  const claimsOpen = acceptsClaims(method);

  return (
    <div>
      <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <QrFrame method={method} />
        <div className="min-w-0">
          <dl className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-ink-900/40 text-[13px]">
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <dt className="text-fg-subtle">Amount</dt>
              <dd className="flex items-center gap-1 font-semibold">
                {formatHKD(amount)}
                <CopyValue value={(amount / 100).toFixed(amount % 100 ? 2 : 0)} label="amount" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 bg-accent/[0.06] px-3.5 py-2.5">
              <dt className="text-fg-subtle">Reference for the note</dt>
              <dd className="flex items-center gap-1 whitespace-nowrap font-mono font-semibold text-[#b9ccff]">
                {reference}
                <CopyValue value={reference} label="reference code" />
              </dd>
            </div>
            {method.note && (
              <div className="bg-warn/[0.07] px-3.5 py-2.5 text-[12px] leading-relaxed text-warn">{method.note}</div>
            )}
            {method.payee.map((p) => (
              <div key={p.label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <dt className="shrink-0 text-fg-subtle">{p.label}</dt>
                <dd className={cn("flex min-w-0 items-center gap-1 text-right", isPlaceholder(p.value) && "text-warn")}>
                  <span className="truncate">{p.value}</span>
                  {p.copy && <CopyValue value={p.value} label={p.label} />}
                </dd>
              </div>
            ))}
          </dl>
          {linkReady && (
            <a href={method.link} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "sm", "mt-3")}>
              <ExternalLink className="size-3.5" /> Open {method.label} link
            </a>
          )}
          <ol className="mt-4 space-y-2 text-[12.5px] leading-relaxed text-fg-muted">
            {method.steps.map((s, i) => (
              <li key={s} className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-[var(--line-strong)] font-mono text-[10.5px] text-fg">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <form
        className="mt-6 border-t border-[var(--line)] pt-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const ref = payer.trim();
          if (ref.length < claimReference.min) return setError("Enter your payment reference so we can find your payment.");
          start(async () => {
            const res = await submitPaymentClaim(orderId, method.id, ref).catch(() => ({
              ok: false as const,
              message: "We couldn't reach the server. Check your connection and try again.",
            }));
            if (!res.ok) return setError(res.message);
            track("payment_claim_submitted", { method: method.id });
            onSubmitted();
          });
        }}
      >
        {!claimsOpen && (
          <div className="mb-4">
            <FormMessage tone="info">
              {method.label} payment details are still being set up, so this method can&rsquo;t take payments yet. Please check back soon.
            </FormMessage>
          </div>
        )}
        <Field label={`After paying: ${method.referenceLabel}`} htmlFor={`payer-${method.id}`} hint="We use this to find your payment. It is never shown to anyone else.">
          <Input
            id={`payer-${method.id}`}
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
            maxLength={claimReference.max}
            placeholder={method.referencePlaceholder}
            autoComplete="off"
            disabled={disabled || pending || !claimsOpen}
          />
        </Field>
        <div className="mt-3"><FormMessage>{error}</FormMessage></div>
        <Button type="submit" size="lg" className="mt-2 w-full" loading={pending} disabled={disabled || !claimsOpen}>
          I&rsquo;ve paid · submit for confirmation
        </Button>
        <p className="mt-2 text-center text-[11.5px] text-fg-subtle">
          We check every payment by hand. Your order joins the queue as soon as it&rsquo;s confirmed.
        </p>
      </form>
    </div>
  );
}

/**
 * Payment for an unpaid order: Alipay, PayMe or bank transfer (the customer
 * reports their payment, an admin confirms it), plus card via Stripe when it
 * is configured. Nothing here can mark an order paid.
 */
export function PaymentPanel({
  orderId,
  amount,
  reference,
  stripe,
  devPayments,
}: {
  orderId: string;
  amount: number;
  reference: string;
  stripe: boolean;
  devPayments: boolean;
}) {
  const router = useRouter();
  const manual = enabledManualPayments();
  const tabs: Tab[] = [...manual.map((m) => m.id), ...(stripe ? (["card"] as const) : [])];
  const [tab, setTab] = useState<Tab>(tabs[0] ?? "card");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"pay" | "dev" | "cancel" | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const price = formatHKD(amount);
  const current = tab === "card" ? null : manual.find((m) => m.id === tab) ?? null;

  if (submitted) {
    return (
      <WaitingAnimation
        title="Payment submitted — we're confirming it"
        steps={["Saving your payment details", "Letting our team know", "Opening your order status"]}
        note="This page updates by itself."
      />
    );
  }

  return (
    <div>
      {tabs.length > 0 ? (
        <div role="tablist" aria-label="Payment method" className="flex flex-wrap gap-1.5 rounded-2xl border border-[var(--line)] bg-ink-900/50 p-1.5">
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
                aria-controls={`pay-${t}`}
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={cn(
                  "relative flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-[13px] font-medium transition",
                  active ? "text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {active && (
                  <motion.span
                    layoutId={`pay-tab-${orderId}`}
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
        <FormMessage tone="info">Online payment isn&rsquo;t set up yet. Please contact support to complete this order.</FormMessage>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          id={`pay-${tab}`}
          role="tabpanel"
          initial={{ opacity: 0, y: 10, rotateX: 6 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformPerspective: 1200 }}
          className="mt-5"
        >
          {current ? (
            <ManualMethod
              orderId={orderId}
              method={current}
              amount={amount}
              reference={reference}
              disabled={pending}
              onSubmitted={() => {
                setSubmitted(true);
                router.refresh();
              }}
            />
          ) : stripe && tab === "card" ? (
            <div className="rounded-2xl border border-[var(--line)] bg-ink-900/40 p-5 text-center">
              <p className="text-[13px] text-fg-muted">Pay by Visa, Mastercard, Google Pay, Apple Pay and other cards through Stripe&rsquo;s secure checkout. The wallets you can use depend on your device.</p>
              <Button
                size="lg"
                className="mt-4 w-full"
                loading={pending && which === "pay"}
                disabled={pending}
                onClick={() => {
                  setWhich("pay");
                  setError(null);
                  track("checkout_started");
                  start(async () => {
                    const res = await startCheckout(orderId);
                    if (res && !res.ok) setError(res.message);
                  });
                }}
              >
                <CreditCard className="size-4" /> Pay {price} by card or Google Pay
              </Button>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-[11.5px] text-fg-subtle">
                <Lock className="size-3" /> Secure checkout by Stripe
              </p>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="mt-4"><FormMessage>{error}</FormMessage></div>

      <div className="mt-4 space-y-2">
        {devPayments && (
          <Button
            variant="outline"
            size="sm"
            className="w-full border-warn/40 text-warn"
            loading={pending && which === "dev"}
            disabled={pending}
            onClick={() => {
              setWhich("dev");
              start(async () => {
                const res = await devMarkPaid(orderId);
                if (!res.ok) setError(res.message);
                router.refresh();
              });
            }}
          >
            Simulate payment (development only)
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={pending}
          loading={pending && which === "cancel"}
          onClick={() => {
            if (!confirm("Cancel this unpaid order? Your text will be deleted.")) return;
            setWhich("cancel");
            start(async () => {
              const res = await cancelUnpaidOrder(orderId);
              if (!res.ok) setError(res.message);
              router.refresh();
            });
          }}
        >
          Cancel order
        </Button>
      </div>
    </div>
  );
}
