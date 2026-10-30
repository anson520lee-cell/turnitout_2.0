"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmTopup, markTopupFake, markTopupReceived, rejectTopup } from "@/app/actions/admin-credits";

export interface PendingTopup {
  id: string;
  usd: number;
  amount: number;
  method: string;
  methodLabel: string;
  /** HK$ the customer should have paid (Alipay), else null */
  expectHkd: number | null;
  reference: string | null;
  email: string;
  createdAt: string;
}

/**
 * One manual top-up awaiting a decision: confirm adds the credits, reject asks for a note.
 * With `added` the credits are already on the account (Alipay, PayPal and similar are credited first and checked later):
 * the buttons are "Received" and "Not received", and not received takes the credits back.
 */
export function TopupReview({ t, added = false }: { t: PendingTopup; added?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  function run(fn: () => ReturnType<typeof confirmTopup>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message);
      else router.refresh();
    });
  }

  return (
    <div className="glass rounded-2xl border-warn/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px]">{t.email}</p>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">{t.methodLabel} · ref <span className="font-mono">{t.reference ?? "—"}</span></p>
          <p className="text-[11.5px] text-fg-subtle">{t.createdAt}</p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-semibold">US${t.usd.toLocaleString("en-US")}</p>
          <p className="text-[12px] text-fg-subtle">{t.amount.toLocaleString("en-US")} credits</p>
          {t.expectHkd !== null && <p className="mt-0.5 text-[12px] font-medium text-warn">Check you received HK${t.expectHkd.toLocaleString("en-HK")}</p>}
          {added && <p className="text-[12px] text-fg-subtle">Credits already added</p>}
        </div>
      </div>
      {rejecting && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Note to the customer (optional)"
          className="mt-3 h-9 w-full rounded-lg border border-[var(--line)] bg-ink-900/40 px-3 text-[13px] outline-none focus:border-accent/60"
        />
      )}
      {error && <p className="mt-2 text-[12.5px] text-risk" role="alert">{error}</p>}
      <div className="mt-3 flex gap-2">
        {rejecting ? (
          <>
            <Button size="sm" variant="danger" loading={pending} onClick={() => run(() => (added ? markTopupFake(t.id, note) : rejectTopup(t.id, note)))}>
              {added ? "Not received: take credits back" : "Reject top-up"}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(false)}>Back</Button>
          </>
        ) : (
          <>
            <Button size="sm" loading={pending} onClick={() => run(() => (added ? markTopupReceived(t.id) : confirmTopup(t.id)))}>
              {added ? "Received" : "Confirm & add credits"}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(true)}>{added ? "Not received" : "Reject"}</Button>
          </>
        )}
      </div>
    </div>
  );
}
