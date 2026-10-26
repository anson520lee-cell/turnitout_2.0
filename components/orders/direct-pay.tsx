"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManualMethod } from "./payment-panel";
import { submitPaymentClaim } from "@/app/actions/orders";
import { formatMoney, manualPayments, orderPayAmount, type ManualPaymentMethod } from "@/config/payments";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

/**
 * "Pay just this order with Alipay": a card on the order's payment panel and a
 * popup with the QR code, the exact amount for this text (no top-up, no
 * minimum) and a box for the transaction number. Submitting records the claim
 * and, when `startsNow`, starts the report straight away (the admin checks the
 * payment later). Otherwise the order page shows "confirming" and starts the
 * report by itself once the admin confirms. Closing the popup changes nothing,
 * so it can be closed and opened again freely.
 */
export function DirectPay({
  orderId,
  methodId,
  price,
  reference,
  report,
  primary,
  autoOpen,
  useCredits = 0,
  startsNow = true,
}: {
  orderId: string;
  methodId: ManualPaymentMethod;
  /** the part of the order's price paid with Alipay, in cents (100 = 1 credit): the price minus useCredits */
  price: number;
  reference: string;
  report: boolean;
  /** the main way to pay on this page (the customer doesn't have enough credits) */
  primary: boolean;
  /** open the popup as soon as the page loads (straight after Get report) */
  autoOpen: boolean;
  /** credits on the customer's account, used first (fewer than the price) */
  useCredits?: number;
  /** the report starts as soon as the number is sent (false: this account has an unchecked payment, so it waits for us) */
  startsNow?: boolean;
}) {
  const router = useRouter();
  const method = manualPayments[methodId];
  const { usd, hkd } = orderPayAmount(method, price);
  const [open, setOpen] = useState(autoOpen);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const usdText = formatMoney("US$", usd);
  const mainText = hkd !== null ? formatMoney("HK$", hkd) : usdText;
  const creditsText = `${useCredits} credit${useCredits === 1 ? "" : "s"}`;
  const isAre = useCredits === 1 ? "is" : "are";
  const priceNote = useCredits > 0
    ? `Your ${creditsText} ${isAre} used first, so you pay only the rest.`
    : "The exact price for your text. No top-up and no minimum.";

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    setOpen(false);
    // Don't pop up again on a reload once the customer has closed it.
    if (autoOpen && window.location.search.includes("created=1")) window.history.replaceState(null, "", window.location.pathname);
  };

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border p-4 sm:p-5",
          primary ? "border-accent/40 bg-accent/[0.07] shadow-[0_0_0_1px_rgb(91_140_255/0.15),0_20px_50px_-30px_rgb(91_140_255/0.6)]" : "border-[var(--line)] bg-ink-900/40",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              <Wallet className="size-4 text-accent" aria-hidden /> Pay just this {report ? "report" : "order"} with {method.label}
            </p>
            <p className="mt-1 text-[12.5px] text-fg-muted">{priceNote}</p>
          </div>
          <p className="text-right">
            <span className="text-2xl font-semibold tracking-tight">{mainText}</span>
            {hkd !== null && <span className="block font-mono text-[11.5px] text-fg-subtle">= {usdText}</span>}
            {useCredits > 0 && <span className="block font-mono text-[11.5px] text-fg-subtle">+ {creditsText} from your balance</span>}
          </p>
        </div>
        <Button
          size="lg"
          variant={primary ? "primary" : "secondary"}
          className="mt-4 w-full"
          onClick={() => {
            track("direct_pay_opened", { method: method.id });
            setOpen(true);
          }}
        >
          Pay {mainText} with {method.label} <ArrowRight className="size-4" />
        </Button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => {
          if (open) close();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="m-auto max-h-[calc(100dvh-16px)] w-[min(680px,calc(100vw-24px))] max-w-none overflow-y-auto overscroll-contain bg-transparent p-0 text-fg backdrop:bg-ink-950/70 backdrop:backdrop-blur-md"
      >
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 24, rotateX: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              style={{ transformPerspective: 1200 }}
              className="glass-strong no-cursor-light noise relative overflow-hidden rounded-3xl"
            >
              <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/20 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4 px-5 pt-5 sm:px-7 sm:pt-6">
                <div>
                  <h2 id={titleId} className="text-[18px] font-semibold tracking-tight">
                    Pay {mainText} with {method.label}
                  </h2>
                  <p className="mt-1 text-[13px] text-fg-muted">
                    {useCredits > 0
                      ? `Your ${creditsText} ${isAre} used first; ${mainText}${hkd !== null ? ` (${usdText})` : ""} is the rest of this ${report ? "report" : "order"}'s price. `
                      : `${hkd !== null ? `${mainText} = ${usdText}, ` : ""}the exact price of this ${report ? "report" : "order"}. `}
                    {startsNow
                      ? report ? "Your report starts as soon as you send the transaction number." : "Your order joins the queue as soon as you send the transaction number."
                      : report ? "Your report starts as soon as we confirm the payment." : "Your order joins the queue as soon as we confirm the payment."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-subtle transition hover:bg-white/[0.06] hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="relative px-5 pb-5 pt-5 sm:px-7 sm:pb-7">
                <ManualMethod
                  method={method}
                  amountLabel={mainText}
                  amountCopy={String(hkd ?? usd)}
                  amountSub={hkd !== null ? `= ${usdText}` : undefined}
                  reference={reference}
                  disabled={false}
                  submit={(m, ref) => submitPaymentClaim(orderId, m, ref, useCredits)}
                  onSubmitted={() => {
                    track("direct_pay_submitted", { method: method.id });
                    close();
                    router.refresh();
                  }}
                  submitLabel={startsNow ? (report ? "I’ve paid · start my report" : "I’ve paid · start my order") : undefined}
                  confirmNote={
                    startsNow
                      ? "We check every payment against our Alipay records afterwards. Accounts that send a wrong or made-up number can no longer pay by Alipay."
                      : report
                        ? "Your earlier Alipay payment is still being checked, so this one is checked by hand first. Keep this page open and your report starts here by itself once it’s confirmed."
                        : "Your earlier Alipay payment is still being checked, so this one is checked by hand first. Your order joins the queue as soon as it’s confirmed."
                  }
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </dialog>
    </>
  );
}
