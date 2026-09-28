"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ClipboardPaste, CornerDownLeft, X } from "lucide-react";
import { createRefinementOrder } from "@/app/actions/orders";
import { PasteDialog } from "@/components/ui/paste-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { RefinementVisual } from "./request-visuals";
import { PaymentMethodStrip } from "./payment-methods";
import { billableChars, formatHKD, refinementPrice, refinementPricing } from "@/config/pricing";
import { refinement } from "@/config/app";
import { disclaimers, refinementMinimumLabel, refinementRateLabel } from "@/config/services";
import { refinementCharError } from "@/lib/orders/limits";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const minimumChars = (refinementPricing.minimum / refinementPricing.perBlock) * refinementPricing.blockChars;

/**
 * /services/refinement: optional instructions on the page, then the paste
 * dialog with a live character count and the exact price. The server
 * recomputes the price from the characters it receives.
 */
export function RefinementRequest({ modelDrafts = false }: { modelDrafts?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card strong className="noise flex flex-col overflow-hidden p-5 sm:p-7">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-violet/20 blur-3xl" />
          <RefinementVisual className="relative min-h-[300px] flex-1 sm:min-h-[330px]" />
          <div className="relative mt-6 grid gap-4 border-t border-[var(--line)] pt-6 sm:grid-cols-3">
            <div>
              <p className="text-[12px] text-fg-subtle">Rate</p>
              <p className="mt-1 text-[20px] font-semibold tracking-tight">{formatHKD(refinementPricing.perBlock)}<span className="text-[13px] font-normal text-fg-subtle"> / {refinementPricing.blockChars} chars</span></p>
            </div>
            <div>
              <p className="text-[12px] text-fg-subtle">Minimum</p>
              <p className="mt-1 text-[20px] font-semibold tracking-tight">{formatHKD(refinementPricing.minimum)}<span className="text-[13px] font-normal text-fg-subtle"> · {minimumChars.toLocaleString("en-HK")} chars</span></p>
            </div>
            <div>
              <p className="text-[12px] text-fg-subtle">Per order</p>
              <p className="mt-1 text-[20px] font-semibold tracking-tight">{(refinement.maxChars / 1000).toLocaleString("en-HK")}k<span className="text-[13px] font-normal text-fg-subtle"> chars max</span></p>
            </div>
          </div>
          <p className="relative mt-3 text-[12px] text-fg-subtle">
            Characters are counted with spaces, and runs of spaces or line breaks count once. Example: 4,250 characters = {formatHKD(refinementPrice(4250))}.
          </p>
        </Card>

        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <Field
              label="Instructions (optional)"
              htmlFor="instructions"
              hint={`E.g. British spelling, keep it formal, focus on paragraphs 2–3. ${instructions.length}/${refinement.maxInstructionChars}`}
            >
              <Textarea
                id="instructions"
                rows={4}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={refinement.maxInstructionChars}
                placeholder="Anything the reviewer should know"
              />
            </Field>
            <Button
              size="lg"
              className="mt-5 h-14 w-full text-[16px]"
              onClick={() => {
                track("refinement_service_clicked", { from: "request_page" });
                setOpen(true);
              }}
            >
              <ClipboardPaste className="size-5" /> Paste your text <ArrowRight className="size-4 transition group-hover/btn:translate-x-0.5" />
            </Button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-fg-subtle">
              You&rsquo;ll see the exact price before you press
              <kbd className="inline-flex items-center gap-1 rounded-md border border-[var(--line-strong)] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10.5px] text-fg">
                Enter <CornerDownLeft className="size-3" />
              </kbd>
            </p>
            <PaymentMethodStrip className="mt-5 border-t border-[var(--line)] pt-4" />
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold">What refinement does</h2>
            <ul className="mt-3 space-y-2 text-[13px] text-fg-muted">
              {["Clearer sentences and smoother flow", "More natural academic style", "Your meaning, facts and citations kept", "Your own voice kept where possible"].map((t) => (
                <li key={t} className="flex gap-2.5"><Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />{t}</li>
              ))}
            </ul>
            <h2 className="mt-5 text-[15px] font-semibold">What it doesn&rsquo;t do</h2>
            <ul className="mt-3 space-y-2 text-[13px] text-fg-muted">
              {["Write new content or arguments for you", "Add or invent sources", "Disguise AI-generated or someone else's work"].map((t) => (
                <li key={t} className="flex gap-2.5"><X className="mt-0.5 size-3.5 shrink-0 text-risk" aria-hidden />{t}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <p className="mt-6 px-1 text-[11.5px] leading-relaxed text-fg-subtle">{disclaimers.refinement}</p>

      <PasteDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Paste the text you want refined"
        description={`${refinementRateLabel} · ${refinementMinimumLabel}. You'll choose how to pay on the next page.`}
        placeholder="Paste your own writing here. Press Enter when you're done."
        submitLabel="Create refinement order"
        validate={(text) => refinementCharError(billableChars(text))}
        meta={(text) => {
          const chars = billableChars(text);
          const ok = !refinementCharError(chars);
          return (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={cn(chars > 0 && !ok ? "text-warn" : chars > 0 ? "text-ok" : undefined)}>
                {chars.toLocaleString("en-HK")} characters
              </span>
              <span>·</span>
              <span className="text-fg">{formatHKD(refinementPrice(chars))}</span>
              {chars < minimumChars && <span>(minimum {formatHKD(refinementPricing.minimum)} applies)</span>}
            </span>
          );
        }}
        footnote={
          <>
            By pressing Enter you confirm this is your own writing. Refinement improves clarity, flow and style; it does not
            disguise authorship or AI-generated text.
            {modelDrafts && " Our writing model may prepare a first draft, and a person reviews every change."} The final
            price is confirmed on the next page.
          </>
        }
        onSubmit={async (text) => {
          const res = await createRefinementOrder({ text, instructions });
          if (!res.ok) return res;
          track("order_created", { service: "refinement" });
          router.push(`/orders/${res.orderId}?created=1`);
          return { ok: true };
        }}
        waitingTitle="Creating your refinement order…"
        waitingSteps={["Counting characters", "Working out the price", "Creating your order", "Preparing payment options"]}
        waitingNote="Please wait and keep this window open. You'll be taken to payment in a moment."
      />
    </>
  );
}
