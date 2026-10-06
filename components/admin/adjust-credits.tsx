"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adjustCredits } from "@/app/actions/admin-credits";

/** Inline +/- credit correction for one user (gift, refund, fix). */
export function AdjustCredits({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Adjust</Button>;
  }
  const field = "h-8 rounded-lg border border-[var(--line)] bg-ink-900/40 px-2 text-[13px] outline-none focus:border-accent/60";
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await adjustCredits({ userId, delta: Number(delta), note });
          if (!r.ok) setError(r.message);
          else {
            setOpen(false);
            setDelta("");
            setNote("");
            router.refresh();
          }
        });
      }}
    >
      <input className={`${field} w-24`} inputMode="numeric" placeholder="+50 / -10" value={delta} onChange={(e) => setDelta(e.target.value)} aria-label="Credits to add or remove" />
      <input className={`${field} w-40`} placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-label="Note" />
      <Button size="sm" loading={pending} type="submit">Apply</Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
      {error && <span className="text-[12px] text-risk" role="alert">{error}</span>}
    </form>
  );
}
