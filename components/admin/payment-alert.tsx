"use client";
import { useEffect, useReducer, useRef, useSyncExternalStore } from "react";
import { Bell, BellRing } from "lucide-react";

/**
 * Admin home: shows how many payments are waiting in the browser tab title,
 * and when a new one arrives while the page is open (it refreshes itself),
 * plays a short chime and, if allowed, shows a desktop notification.
 */
export function PaymentAlert({ count }: { count: number }) {
  const last = useRef<number | null>(null);
  // read on every render; after asking for permission, a re-render picks up the answer
  const allowed = useSyncExternalStore(noSubscribe, permission, () => "unsupported" as const);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = count > 0 ? `(${count}) ${base}` : base;
    const before = last.current;
    last.current = count;
    if (before === null || count <= before) return;
    chime();
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("New payment to check", { body: `${count} payment${count === 1 ? "" : "s"} waiting. Check the amount in your account, then Confirm or Reject.` });
      }
    } catch {
      // some browsers only allow notifications from a service worker; the chime and title still work
    }
  }, [count]);

  if (allowed === "unsupported" || allowed === "denied") return null;
  return allowed === "granted" ? (
    <p className="flex items-center gap-1.5 text-[12px] text-fg-subtle"><BellRing className="size-3.5" aria-hidden /> Desktop alerts on</p>
  ) : (
    <button
      type="button"
      onClick={async () => {
        await Notification.requestPermission();
        rerender();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1 text-[12px] text-fg-muted transition hover:border-accent/50 hover:text-fg"
    >
      <Bell className="size-3.5" aria-hidden /> Alert me when a payment comes in
    </button>
  );
}

const noSubscribe = () => () => {};
const permission = (): NotificationPermission | "unsupported" => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
  } catch {
    // no sound available
  }
}
