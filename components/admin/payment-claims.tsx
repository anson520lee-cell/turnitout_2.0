"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { confirmPaymentClaim, rejectPaymentClaim } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormMessage, Input } from "@/components/ui/field";
import { CopyValue } from "@/components/orders/copy-value";
import { orderAmountParts, orderAmountText, paymentMethodLabel } from "@/config/payments";
import { formatDateTime, shortId } from "@/lib/utils";
import type { PaymentClaim } from "@/types/domain";

const tone = { pending: "warn", confirmed: "success", rejected: "danger" } as const;

const creditsText = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;

/**
 * Confirm / Reject for one pending claim. `held` is the credits already taken
 * from the customer's balance for this order (used before Alipay); the claim
 * covers the rest of the price.
 */
export function ClaimActions({ claim, orderPrice, held = 0 }: { claim: PaymentClaim; orderPrice: number; held?: number }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"confirm" | "reject" | null>(null);

  const run = (kind: "confirm" | "reject") =>
    start(async () => {
      setWhich(kind);
      setMsg(null);
      try {
        const fn = kind === "confirm" ? confirmPaymentClaim : rejectPaymentClaim;
        const r = await fn({ claimId: claim.id, note });
        setMsg(r.ok ? { ok: true, message: kind === "confirm" ? "Confirmed. The order is paid; the customer\u2019s report starts on their order page." : "Rejected. The customer can submit again." } : { ok: false, message: r.message });
        if (r.ok) router.refresh();
      } catch (e) {
        setMsg({ ok: false, message: e instanceof Error ? e.message : "Request failed." });
      }
    });

  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      {claim.amount + held * 100 !== orderPrice && (
        <p className="mb-2 text-[12px] text-warn">Claim amount{held ? ` plus ${creditsText(held)}` : ""} differs from the order price ({orderAmountText(claim.method, orderPrice)}).</p>
      )}
      <label htmlFor={`note-${claim.id}`} className="sr-only">Note to customer</label>
      <Input
        id={`note-${claim.id}`}
        className="h-9 text-[13px]"
        placeholder="Note to customer (optional, shown if rejected)"
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        disabled={pending}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={pending && which === "confirm"}
          disabled={pending}
          onClick={() => {
            const amount = orderAmountParts(claim.method, claim.amount).main;
            if (!confirm(`Did ${amount} arrive in your ${paymentMethodLabel(claim.method)} account with transaction number ${claim.payer_reference}?\n\nOnly confirm if the amount is exactly ${amount} (not less). The order will be marked paid and the report starts.`)) return;
            run("confirm");
          }}
        >
          <Check className="size-3.5" /> Confirm payment received
        </Button>
        <Button
          size="sm"
          variant="danger"
          loading={pending && which === "reject"}
          disabled={pending}
          onClick={() => {
            if (!confirm(`Reject this payment? The order stays unpaid, no report is made${held ? `, the ${creditsText(held)} taken from their balance ${held === 1 ? "goes" : "go"} back to them` : ""}, and they can submit again.`)) return;
            run("reject");
          }}
        >
          <X className="size-3.5" /> Reject
        </Button>
      </div>
      {msg && <div className="mt-2"><FormMessage tone={msg.ok ? "success" : "error"}>{msg.message}</FormMessage></div>}
    </div>
  );
}

/**
 * Manual payment claims on one order. Confirm only after you have seen the
 * money in the Alipay / PayMe / bank account; that is what marks it paid.
 */
export function PaymentClaims({ claims, orderPrice, reference, held = 0 }: { claims: PaymentClaim[]; orderPrice: number; reference: string; held?: number }) {
  const pendingCount = claims.filter((c) => c.status === "pending").length;
  return (
    <Card className={pendingCount ? "border-warn/40 p-5 shadow-[0_0_0_1px_rgb(141_179_255/0.2),0_20px_60px_-30px_rgb(141_179_255/0.45)]" : "p-5"}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold">Payment claims</h2>
        {pendingCount > 0 && <Badge tone="warn" dot>Payment to verify</Badge>}
      </div>
      <p className="mt-1 text-[12.5px] text-fg-muted">
        Look for the customer&rsquo;s transaction number (and reference <span className="font-mono text-fg">{reference}</span> if they added it) and the exact amount in the account before confirming.
      </p>
      {claims.length ? (
        <ul className="mt-4 space-y-3">
          {claims.map((c) => (
            <li key={c.id} className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3.5 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {paymentMethodLabel(c.method)} · {orderAmountText(c.method, c.amount)}
                </p>
                <Badge tone={tone[c.status]} dot>{c.status[0].toUpperCase() + c.status.slice(1)}</Badge>
              </div>
              <dl className="mt-2 grid gap-1.5 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <dt className="w-28 shrink-0 text-fg-subtle">Customer ref</dt>
                  <dd className="flex min-w-0 items-center gap-1"><span className="break-all">{c.payer_reference}</span><CopyValue value={c.payer_reference} label="customer reference" /></dd>
                </div>
                {c.status === "pending" && held > 0 && (
                  <div className="flex gap-2"><dt className="w-28 shrink-0 text-fg-subtle">Also paid</dt><dd>{creditsText(held)} from their balance (already taken)</dd></div>
                )}
                <div className="flex gap-2"><dt className="w-28 shrink-0 text-fg-subtle">Submitted</dt><dd>{formatDateTime(c.created_at)}</dd></div>
                {c.reviewed_at && <div className="flex gap-2"><dt className="w-28 shrink-0 text-fg-subtle">Reviewed</dt><dd>{formatDateTime(c.reviewed_at)}</dd></div>}
                {c.admin_note && <div className="flex gap-2"><dt className="w-28 shrink-0 text-fg-subtle">Note</dt><dd className="text-fg-muted">{c.admin_note}</dd></div>}
              </dl>
              {c.status === "pending" && <ClaimActions claim={c} orderPrice={orderPrice} held={held} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12.5px] text-fg-subtle">No manual payment reported for this order.</p>
      )}
    </Card>
  );
}

/**
 * One payment to check, on the admin home: the exact amount to look for, the
 * transaction number to search, and Confirm / Reject right there. Nothing is
 * made for the customer until Confirm is pressed.
 */
export function ClaimQuickReview({
  claim,
  orderId,
  orderPrice,
  email,
  held,
}: {
  claim: PaymentClaim;
  orderId: string;
  orderPrice: number;
  email: string | null;
  held: number;
}) {
  const parts = orderAmountParts(claim.method, claim.amount);
  return (
    <Card className="border-warn/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-warn">Check your {paymentMethodLabel(claim.method)} account for exactly</p>
          <p className="mt-0.5 text-3xl font-semibold tracking-tight">{parts.main}</p>
          <p className="font-mono text-[11.5px] text-fg-subtle">{parts.sub}</p>
          {held > 0 && <p className="mt-1 text-[12px] text-fg-muted">+ {creditsText(held)} from their balance (already taken, nothing to check)</p>}
        </div>
        <Link href={`/admin/orders/${orderId}`} className="font-mono text-[13px] text-accent hover:underline">#{shortId(orderId)}</Link>
      </div>
      <dl className="mt-3 grid gap-1.5 text-[12.5px]">
        <div className="flex items-center gap-2">
          <dt className="w-28 shrink-0 text-fg-subtle">Transaction no.</dt>
          <dd className="flex min-w-0 items-center gap-1 font-mono text-fg"><span className="break-all">{claim.payer_reference}</span><CopyValue value={claim.payer_reference} label="transaction number" /></dd>
        </div>
        <div className="flex gap-2"><dt className="w-28 shrink-0 text-fg-subtle">Customer</dt><dd className="min-w-0 truncate">{email ?? "—"}</dd></div>
        <div className="flex gap-2"><dt className="w-28 shrink-0 text-fg-subtle">Reported</dt><dd>{formatDateTime(claim.created_at)}</dd></div>
      </dl>
      <ClaimActions claim={claim} orderPrice={orderPrice} held={held} />
    </Card>
  );
}
