"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import { ExternalLink, QrCode } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { CopyValue } from "./copy-value";
import { claimReference, acceptsClaims, isPlaceholder, type ManualPaymentConfig } from "@/config/payments";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

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

/**
 * Payment instructions for one manual method (PayPal, USDT, USDC, Bitcoin):
 * QR and payee details, the exact amount and reference, and a form for the
 * customer's payment reference. `submit` records the claim; nothing here can
 * add credits by itself.
 */
export function ManualMethod({
  method,
  amountLabel,
  amountCopy,
  reference,
  disabled,
  submit,
  onSubmitted,
}: {
  method: ManualPaymentConfig;
  /** e.g. "US$20" */
  amountLabel: string;
  /** the number to copy, e.g. "20" */
  amountCopy: string;
  reference: string;
  disabled: boolean;
  submit: (method: string, reference: string) => Promise<{ ok: true } | { ok: false; message: string }>;
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
                {amountLabel}
                <CopyValue value={amountCopy} label="amount" />
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
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-[var(--line-strong)] font-mono text-[11px] text-fg">{i + 1}</span>
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
            const res = await submit(method.id, ref).catch(() => ({
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
          We check every payment by hand. Your credits are added as soon as it&rsquo;s confirmed.
        </p>
      </form>
    </div>
  );
}
