"use client";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CornerDownLeft, FileCheck2, Gift, Lock } from "lucide-react";
import { createFreeReportOrder } from "@/app/actions/orders";
import { PasteDialog } from "@/components/ui/paste-dialog";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { billableChars, reportPricing } from "@/config/pricing";
import { freeReport } from "@/config/app";
import { freeReportCharError } from "@/lib/orders/limits";
import { nextHkMidnight } from "@/lib/free-report-time";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

/** What the card needs from the server: a guest can try it (sign-in is asked on Enter); an account knows what is left. */
export type DailyReportStatus = { mode: "guest" } | { mode: "account"; remaining: number; unlimited: boolean };

const n = (v: number) => v.toLocaleString("en-HK");

const PERKS = [
  "The whole report: AI score, every sentence rated with its reason, paragraph map",
  "The full live scan and every effect",
  "PDF download",
];

/** "5 h 12 min" until the next Hong Kong midnight; null on the server so the first paint matches. */
function useResetIn(): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const mins = Math.max(1, Math.ceil((nextHkMidnight() - Date.now()) / 60_000));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      setText(h > 0 ? `${h} h ${m} min` : `${m} min`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return text;
}

/** Progress ring: full while today's free report is available, empty and locked once it is used. */
function Ring({ available }: { available: boolean }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-24 shrink-0 place-items-center" aria-hidden>
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(148 163 255 / 0.2)" strokeWidth="1" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={available ? "url(#daily-ring)" : "transparent"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={available ? 0 : c}
          className={available ? "daily-ring-arc" : undefined}
          style={{ "--c": c, transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)", filter: available ? "drop-shadow(0 0 6px rgb(91 140 255 / 0.75))" : undefined } as CSSProperties}
        />
        <defs>
          <linearGradient id="daily-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5b8cff" />
            <stop offset="1" stopColor="#8db3ff" />
          </linearGradient>
        </defs>
      </svg>
      {available ? (
        <div className="text-center leading-none">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">1</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">left</p>
        </div>
      ) : (
        <Lock className="size-6 text-fg-subtle" strokeWidth={1.5} />
      )}
    </div>
  );
}

/**
 * The "daily free report" card: one free full report a day (up to 4,000
 * characters), same report as the paid one. Shows what is left, when it comes
 * back, and turns into a locked card with a way to buy a report once used.
 */
export function DailyReportCard({
  status,
  paidHref = "/services/screening#paid-report",
  className,
}: {
  status: DailyReportStatus;
  /** Where "get a full report" leads once today's free one is used. */
  paidHref?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const resetIn = useResetIn();
  const used = status.mode === "account" && status.remaining <= 0;
  const unlimited = status.mode === "account" && status.unlimited;

  return (
    <>
      <Card strong className={cn("daily-card relative overflow-hidden p-5 sm:p-6", used && "opacity-95", className)} id="daily-free-report">
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          <Ring available={!used} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Daily free report</p>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium",
                  used ? "border-white/10 bg-white/[0.04] text-fg-muted" : "border-ok/25 bg-ok/10 text-ok",
                )}
              >
                {used ? <Lock className="size-3" aria-hidden /> : <Gift className="size-3" aria-hidden />}
                {used ? "Used today" : unlimited ? "Owner · unlimited" : "1 left today"}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              {used ? "Today's free report is used" : `One free full report every day, up to ${n(freeReport.maxChars)} characters`}
            </h2>
            <ul className={cn("daily-perks mt-3 space-y-1.5 text-[13px] text-fg-muted", used && "daily-perks-off")}>
              {PERKS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-3 flex items-center gap-1.5 text-[12px] text-fg-subtle">
              <CalendarClock className="size-3.5" aria-hidden />
              {used
                ? resetIn
                  ? `Comes back in ${resetIn} (midnight Hong Kong time)`
                  : "Comes back at midnight Hong Kong time"
                : "Resets every day at midnight Hong Kong time."}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            {used ? (
              <>
                <Link href={paidHref} className={buttonClasses("primary", "lg", "h-12 px-6")}>
                  <FileCheck2 className="size-4" /> Get a full report
                </Link>
                <p className="text-[12px] text-fg-subtle sm:text-right">Pay with Alipay or credits, any length up to {reportPricing.maxChars.toLocaleString("en-HK")} characters</p>
              </>
            ) : (
              <>
                <Button
                  size="lg"
                  className="h-12 px-6"
                  onClick={() => {
                    track("daily_report_clicked", { guest: status.mode === "guest" });
                    setOpen(true);
                  }}
                >
                  <Gift className="size-4" /> Use today&rsquo;s free report
                </Button>
                <p className="flex items-center gap-1.5 text-[12px] text-fg-subtle sm:justify-end">
                  Paste, then press
                  <kbd className="inline-flex items-center gap-1 rounded-md border border-[var(--line-strong)] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-fg">
                    Enter <CornerDownLeft className="size-3" />
                  </kbd>
                </p>
                {status.mode === "guest" && <p className="text-[12px] text-fg-subtle sm:text-right">A free account is needed to start it</p>}
              </>
            )}
          </div>
        </div>
      </Card>

      <PasteDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Paste your text for today's free report"
        description={`Free · ${n(freeReport.minChars)}–${n(freeReport.maxChars)} characters · the same full report as a paid one, with PDF.`}
        placeholder="Paste the text you want a report on. Press Enter when you're done."
        submitLabel="Start my free report"
        validate={(text) => freeReportCharError(billableChars(text))}
        meta={(text) => {
          const chars = billableChars(text);
          const inRange = chars >= freeReport.minChars && chars <= freeReport.maxChars;
          return (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={cn(chars > 0 && !inRange ? "text-warn" : chars > 0 ? "text-ok" : undefined)}>{n(chars)} characters</span>
              <span>·</span>
              <span className="text-fg">Free</span>
              <span>·</span>
              <span>up to {n(freeReport.maxChars)}</span>
            </span>
          );
        }}
        footnote={<>By pressing Enter you confirm that you wrote this text or are otherwise authorised to submit it.</>}
        onSubmit={async (text) => {
          const res = await createFreeReportOrder({ text });
          if (!res.ok) return res;
          track("order_created", { service: "daily_free_report" });
          router.push(`/orders/${res.orderId}`);
          return { ok: true };
        }}
        waitingTitle="Starting your free report…"
        waitingSteps={["Counting characters", "Checking today's allowance", "Creating your report", "Opening the live scan"]}
        waitingNote="Please wait and keep this window open. Your report starts in a moment."
      />
    </>
  );
}
