"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardPaste, FileCheck2, ShieldCheck } from "lucide-react";
import { createScreeningTextOrder } from "@/app/actions/orders";
import { PasteDialog } from "@/components/ui/paste-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PaymentMethodStrip } from "./payment-methods";
import { billableChars, formatCredits, priceUsd, reportPrice, reportPricing } from "@/config/pricing";
import { formatMoney } from "@/config/payments";
import { reportFromLabel, reportLimitsLabel, reportRangeLabel, reportRateLabel, reportService } from "@/config/services";
import { reportCharError } from "@/lib/orders/limits";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const STEPS = [
  { icon: ClipboardPaste, t: "Paste your text", d: `Choose Paste your text, add ${reportRangeLabel}, press Enter.` },
  { icon: ShieldCheck, t: "Pay", d: "Pay just this report's exact price with Alipay, or use credits topped up with crypto (USDT, USDC or BTC), PayPal or Alipay." },
  { icon: FileCheck2, t: "Get your report here", d: "Watch a live scan of your text (about a minute for 5,000 characters), then read the report on your order page, with a PDF download." },
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
        <Card strong id="paid-report" className="orb-paid-request relative flex scroll-mt-24 flex-col overflow-hidden p-6 sm:p-8">
          <div className="orb-request-art" aria-hidden="true" />
          <div className="relative">
            <p className="orb-label"><span className="orb-indicator" /> Pay per report</p>
            <h2 className="mt-5 max-w-sm text-balance text-3xl font-semibold tracking-tight sm:text-5xl">Review a longer draft.</h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-fg-muted">For drafts of {reportRangeLabel}, or when you need another report today.</p>
          </div>
          <div className="relative mt-auto pt-12 sm:pt-20">
            <div className="flex flex-wrap items-end justify-between gap-5 border-t border-[var(--line)] pt-6">
              <div>
                <p className="text-2xl font-semibold tracking-tight">{reportFromLabel}</p>
                <p className="mt-1 text-[13px] text-fg-muted">{reportRateLabel}</p>
              </div>
              <Button
                size="lg"
                onClick={() => {
                  track("screening_service_clicked", { from: "request_page" });
                  setOpen(true);
                }}
              >
                Paste your text <ArrowRight className="size-4 transition group-hover/btn:translate-x-0.5" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-fg-subtle">{reportLimitsLabel}.</p>
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
                "Grammar notes and an optional Writing Refinement add-on",
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
        description={`${reportRateLabel} · ${reportLimitsLabel.toLowerCase()} · ${reportRangeLabel}. Next, pay this report's exact price with Alipay, or use credits.`}
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
              <span className="text-fg">
                {chars > 0 ? `${formatCredits(reportPrice(chars))} (${formatMoney("US$", priceUsd(reportPrice(chars)))})` : reportFromLabel}
              </span>
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
