"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { confirmPaymentClaim, rejectPaymentClaim } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormMessage, Input } from "@/components/ui/field";
import { CopyValue } from "@/components/orders/copy-value";
import { paymentMethodLabel } from "@/config/payments";
import { formatHKD } from "@/config/pricing";
import { formatDateTime } from "@/lib/utils";
import type { PaymentClaim } from "@/types/domain";

const tone = { pending: "warn", confirmed: "success", rejected: "danger" } as const;

function ClaimActions({ claim, orderPrice }: { claim: PaymentClaim; orderPrice: number }) {
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
        setMsg(r.ok ? { ok: true, message: kind === "confirm" ? "Confirmed. The order is paid and queued." : "Rejected. The customer can submit again." } : { ok: false, message: r.message });
        if (r.ok) router.refresh();
      } catch (e) {
        setMsg({ ok: false, message: e instanceof Error ? e.message : "Request failed." });
      }
    });

  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      {claim.amount !== orderPrice && (
        <p className="mb-2 text-[12px] text-warn">Claim amount differs from the order price ({formatHKD(orderPrice)}).</p>
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
            if (!confirm(`Confirm you received ${formatHKD(claim.amount)} by ${paymentMethodLabel(claim.method)}? The order will be marked paid and queued.`)) return;
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
            if (!confirm("Reject this claim? The order stays unpaid and the customer can submit again.")) return;
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
export function PaymentClaims({ claims, orderPrice, reference }: { claims: PaymentClaim[]; orderPrice: number; reference: string }) {
  const pendingCount = claims.filter((c) => c.status === "pending").length;
  return (
    <Card className={pendingCount ? "border-warn/40 p-5 shadow-[0_0_0_1px_rgb(245_195_91/0.2),0_20px_60px_-30px_rgb(245_195_91/0.45)]" : "p-5"}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold">Payment claims</h2>
        {pendingCount > 0 && <Badge tone="warn" dot>Payment to verify</Badge>}
      </div>
      <p className="mt-1 text-[12.5px] text-fg-muted">
        Look for reference <span className="font-mono text-fg">{reference}</span> and the exact amount in the account before confirming.
      </p>
      {claims.length ? (
        <ul className="mt-4 space-y-3">
          {claims.map((c) => (
            <li key={c.id} className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3.5 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {paymentMethodLabel(c.method)} · {formatHKD(c.amount)}
                </p>
                <Badge tone={tone[c.status]} dot>{c.status[0].toUpperCase() + c.status.slice(1)}</Badge>
              </div>
              <dl className="mt-2 grid gap-1.5 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <dt className="w-28 shrink-0 text-fg-subtle">Customer ref</dt>
                  <dd className="flex min-w-0 items-center gap-1"><span className="break-all">{c.payer_reference}</span><CopyValue value={c.payer_reference} label="customer reference" /></dd>
                </div>
                <div className="flex gap-2"><dt className="w-28 shrink-0 text-fg-subtle">Submitted</dt><dd>{formatDateTime(c.created_at)}</dd></div>
                {c.reviewed_at && <div className="flex gap-2"><dt className="w-28 shrink-0 text-fg-subtle">Reviewed</dt><dd>{formatDateTime(c.reviewed_at)}</dd></div>}
                {c.admin_note && <div className="flex gap-2"><dt className="w-28 shrink-0 text-fg-subtle">Note</dt><dd className="text-fg-muted">{c.admin_note}</dd></div>}
              </dl>
              {c.status === "pending" && <ClaimActions claim={c} orderPrice={orderPrice} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12.5px] text-fg-subtle">No manual payment reported for this order.</p>
      )}
    </Card>
  );
}
