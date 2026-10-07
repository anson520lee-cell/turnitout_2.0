"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { CopyValue } from "@/components/orders/copy-value";
import { DEAD_STATUSES, PAID_STATUSES, STATUS_COPY, findCoin, type NpStatus } from "@/lib/payments/nowpayments/core";
import { formatUSD, usdToCredits } from "@/config/pricing";
import { formatDateTime } from "@/lib/utils";

export interface CryptoPaymentData {
  id: string;
  usd: number;
  pay_currency: string;
  network: string | null;
  pay_amount: number | null;
  actually_paid: number | null;
  pay_address: string | null;
  status: NpStatus;
  expires_at: string | null;
  created_at: string;
  paid_at: string | null;
  np_payment_id: string | null;
}

const icons = { info: Clock, progress: Loader2, success: CheckCircle2, danger: XCircle, warn: AlertTriangle } as const;

/** Plain decimal text for a coin amount (never 1e-7). */
export function coinAmount(n: number | null): string {
  if (n === null) return "";
  const s = n.toFixed(8).replace(/0+$/, "");
  return s.endsWith(".") ? s + "00" : s.split(".")[1]?.length === 1 ? s + "0" : s;
}

function useCountdown(expiresAt: string | null, active: boolean) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt || !active) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt, active]);
  return left;
}

/**
 * The crypto payment page. It shows exactly what NOWPayments returned
 * (coin, network, exact amount, address) and the live status. The status
 * comes from our server, which in turn trusts only NOWPayments; nothing on
 * this page can mark a payment as paid.
 */
export function CryptoPaymentView({ initial, qr, poll = true }: { initial: CryptoPaymentData; qr: string | null; poll?: boolean }) {
  const [p, setP] = useState(initial);
  const coin = findCoin(p.pay_currency);
  const asset = coin?.asset ?? p.pay_currency.toUpperCase();
  const network = p.network ?? coin?.network ?? "";
  const copy = STATUS_COPY[p.status];
  const Icon = icons[copy.tone];
  const waiting = p.status === "waiting";
  const left = useCountdown(p.expires_at, waiting);
  const timedOut = waiting && left === 0;

  useEffect(() => {
    if (!poll || PAID_STATUSES.includes(p.status) || DEAD_STATUSES.includes(p.status)) return;
    let stop = false;
    const run = async () => {
      try {
        const r = await fetch(`/api/payments/nowpayments/status/${initial.id}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { payment?: CryptoPaymentData };
        if (!stop && j.payment) setP(j.payment);
      } catch {
        /* keep the last known status */
      }
    };
    const t = setInterval(run, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [poll, p.status, initial.id]);

  const mm = left !== null ? String(Math.floor(left / 60)).padStart(2, "0") : "--";
  const ss = left !== null ? String(left % 60).padStart(2, "0") : "--";
  const done = PAID_STATUSES.includes(p.status);

  return (
    <div className="space-y-5">
      <Card strong className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-[var(--line)] bg-white/[0.04]">
              <Icon className={`size-5 ${copy.tone === "progress" ? "animate-spin" : ""}`} aria-hidden />
            </span>
            <div>
              <p className="text-[15px] font-semibold" role="status" aria-live="polite">{timedOut ? "Payment time is running out" : copy.title}</p>
              <p className="text-[13px] text-fg-muted">{timedOut ? "If you haven't sent yet, start a new payment." : copy.body}</p>
            </div>
          </div>
          <Badge tone={copy.tone} dot>{p.status.replace("_", " ")}</Badge>
        </div>

        {p.status === "partially_paid" && p.actually_paid !== null && p.pay_amount !== null && (
          <p className="mt-4 rounded-xl border border-warn/25 bg-warn/10 px-3.5 py-2.5 text-[13px] text-warn">
            Received {coinAmount(p.actually_paid)} {asset} of {coinAmount(p.pay_amount)} {asset}.
          </p>
        )}
        {done && (
          <p className="mt-4 text-[13px] text-fg-muted">
            {formatUSD(p.usd)} → <span className="font-semibold text-fg">{usdToCredits(p.usd).toLocaleString("en-US")} credits</span>
          </p>
        )}
      </Card>

      {(waiting || p.status === "confirming") && p.pay_address && p.pay_amount !== null && (
        <Card className="p-5 sm:p-6">
          <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
            <div className="mx-auto">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={`QR code for the ${asset} payment address`} width={188} height={188} className="rounded-xl bg-white p-2" />
              ) : (
                <div className="grid size-[188px] place-items-center rounded-xl border border-[var(--line)] text-[12px] text-fg-subtle">QR unavailable</div>
              )}
              {waiting && left !== null && (
                <p className="mt-2 text-center font-mono text-[13px] text-fg-muted">Time left {mm}:{ss}</p>
              )}
            </div>

            <dl className="min-w-0 space-y-3.5 text-[13px]">
              <Row label="You pay" value={`${formatUSD(p.usd)} → ${usdToCredits(p.usd).toLocaleString("en-US")} credits`} />
              <Row label="Asset" value={asset} />
              <Row label="Network" value={network} strong />
              <Row label="Exact amount" value={`${coinAmount(p.pay_amount)} ${asset}`} copy={coinAmount(p.pay_amount)} mono />
              <Row label="Send to this address" value={p.pay_address} copy={p.pay_address} mono wrap />
              {p.expires_at && <Row label="Valid until" value={formatDateTime(p.expires_at)} />}
            </dl>
          </div>

          <div className="mt-5 flex gap-3 rounded-xl border border-warn/25 bg-warn/10 p-3.5 text-[13px] leading-relaxed text-warn">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <strong>Send only {asset} on the {network} network.</strong> Coins sent on another network, or a different asset, are lost and cannot be recovered. Send the exact amount shown; exchange fees are paid by you, so make sure the full amount arrives.
            </p>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-fg-subtle">
        <span>
          Payment ID {p.np_payment_id ?? p.id.slice(0, 8)} · started {formatDateTime(p.created_at)}
          {p.paid_at ? ` · paid ${formatDateTime(p.paid_at)}` : ""}
        </span>
        <span className="flex gap-2">
          {(p.status === "failed" || p.status === "expired" || timedOut) && (
            <Link href="/billing" className={buttonClasses("primary", "sm")}>Start a new payment</Link>
          )}
          <Link href="/billing" className={buttonClasses("secondary", "sm")}>Back to billing</Link>
        </span>
      </div>
    </div>
  );
}

function Row({ label, value, copy, mono, wrap, strong }: { label: string; value: string; copy?: string; mono?: boolean; wrap?: boolean; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[11.5px] uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5">
        <span className={`min-w-0 ${wrap ? "break-all" : "truncate"} ${mono ? "font-mono text-[13px]" : ""} ${strong ? "font-semibold text-fg" : "text-fg"}`}>{value}</span>
        {copy && <CopyValue value={copy} label={label} />}
      </dd>
    </div>
  );
}
