"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardPaste, CornerDownLeft, FileCheck2, ShieldCheck } from "lucide-react";
import { createScreeningTextOrder } from "@/app/actions/orders";
import { PasteDialog } from "@/components/ui/paste-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ReportVisual } from "./request-visuals";
import { PaymentMethodStrip } from "./payment-methods";
import { billableChars, formatCredits, reportPrice, reportPricing } from "@/config/pricing";
import { reportFromLabel, reportLimitsLabel, reportRangeLabel, reportRateLabel, reportService } from "@/config/services";
import { reportCharError } from "@/lib/orders/limits";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const STEPS = [
  { icon: ClipboardPaste, t: "Paste your text", d: `Press Get report, paste ${reportRangeLabel}, press Enter.` },
  { icon: ShieldCheck, t: "Pay", d: "Pay with credits, topped up with crypto (USDT, USDC or BTC) or PayPal." },
  { icon: FileCheck2, t: "Get your report here", d: "Watch a live scan of your text (about 2 minutes for 5,000 characters), then read the report on your order page, with a PDF download." },
];

/**
 * /services/screening: explains the report and opens the paste dialog. On
 * Enter the server creates the order and we go to its payment page while
 * the dialog keeps showing "please wait".
 */
export function ReportRequest() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card strong id="paid-report" className="noise flex scroll-mt-24 flex-col overflow-hidden p-5 sm:p-7">
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-accent/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 right-0 size-72 rounded-full bg-violet/15 blur-3xl" />
          <ReportVisual className="relative min-h-[520px] flex-1 sm:min-h-[430px]" />
          <div className="relative mt-6 flex flex-wrap items-end justify-between gap-5 border-t border-[var(--line)] pt-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">One report · made on the spot</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight">
                {reportFromLabel}
                <span className="mt-1 block text-[14px] font-normal text-fg-subtle">{reportRateLabel}</span>
              </p>
              <p className="mt-1 text-[13px] text-fg-muted">{reportLimitsLabel}. For texts of {reportRangeLabel}.</p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <Button
                size="lg"
                className="h-14 px-8 text-[16px]"
                onClick={() => {
                  track("screening_service_clicked", { from: "request_page" });
                  setOpen(true);
                }}
              >
                <FileCheck2 className="size-5" /> Get report <ArrowRight className="size-4 transition group-hover/btn:translate-x-0.5" />
              </Button>
              <p className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
                Paste, then press
                <kbd className="inline-flex items-center gap-1 rounded-md border border-[var(--line-strong)] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-fg">
                  Enter <CornerDownLeft className="size-3" />
                </kbd>
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold">What you receive</h2>
            <ul className="mt-4 space-y-3 text-[13.5px] text-fg-muted">
              {[
                "An overall AI-writing risk level for your whole text",
                "A map of every paragraph, from low to high risk",
                "The sentences that read most like AI writing, with a question to ask yourself about each",
                "Grammar spots: where and what kind, never a rewrite",
                "A PDF you can download",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_10px_2px_rgb(91_140_255/0.6)]" />
                  {t}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold">How it works</h2>
            <ol className="mt-4 space-y-4">
              {STEPS.map((s, i) => (
                <li key={s.t} className="flex gap-3.5">
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-gradient-to-b from-white/[0.08] to-transparent",
                      i === 0 ? "text-accent" : i === 1 ? "text-violet" : "text-ok",
                    )}
                  >
                    <s.icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium">{i + 1}. {s.t}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-subtle">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <PaymentMethodStrip className="mt-5 border-t border-[var(--line)] pt-4" />
          </Card>
        </div>
      </div>

      <PasteDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Paste your text for the report"
        description={`${reportRateLabel} · ${reportLimitsLabel.toLowerCase()} · ${reportRangeLabel}. You'll choose how to pay on the next page.`}
        placeholder="Paste the full text you want a report on. Press Enter when you're done."
        submitLabel="Create report request"
        validate={(text) => reportCharError(billableChars(text))}
        meta={(text) => {
          const chars = billableChars(text);
          const inRange = chars >= reportPricing.minChars && chars <= reportPricing.maxChars;
          return (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={cn(chars > 0 && !inRange ? "text-warn" : chars > 0 ? "text-ok" : undefined)}>
                {chars.toLocaleString("en-HK")} characters
              </span>
              <span>·</span>
              <span className="text-fg">{chars > 0 ? formatCredits(reportPrice(chars)) : reportFromLabel}</span>
              <span>·</span>
              <span>{reportRangeLabel}</span>
            </span>
          );
        }}
        footnote={<>By pressing Enter you confirm that you wrote this text or are otherwise authorised to submit it.</>}
        onSubmit={async (text) => {
          const res = await createScreeningTextOrder({ text });
          if (!res.ok) return res;
          track("order_created", { service: reportService });
          router.push(`/orders/${res.orderId}?created=1`);
          return { ok: true };
        }}
        waitingTitle="Creating your report request…"
        waitingSteps={["Counting characters", "Checking the length", "Creating your order", "Preparing payment options"]}
        waitingNote="Please wait and keep this window open. You'll be taken to payment in a moment."
      />
    </>
  );
}
