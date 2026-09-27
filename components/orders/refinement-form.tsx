"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRefinementOrder } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { formatHKD, refinementPrice, refinementPricing } from "@/config/pricing";
import { refinement } from "@/config/app";
import { countWords, cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

export function RefinementForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [integrity, setIntegrity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const words = countWords(text);
  const valid = words >= refinement.minWords && words <= refinement.maxWords;

  return (
    <form
      noValidate
      className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!title.trim()) return setError("Enter a title.");
        if (!valid) return setError(`Submit between ${refinement.minWords} and ${refinement.maxWords.toLocaleString()} words.`);
        if (!integrity) return setError("Please confirm this is your own writing.");
        setLoading(true);
        const res = await createRefinementOrder({ title, text, instructions, integrity: true }).catch(() => ({ ok: false as const, message: "Network error. Please try again." }));
        setLoading(false);
        if (!res.ok) return setError(res.message);
        track("order_created", { service: "refinement" });
        router.push(`/orders/${res.orderId}?created=1`);
      }}
    >
      <div className="space-y-5">
        <Card className="space-y-5 p-5 sm:p-6">
          <Field label="Title" htmlFor="title">
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </Field>
          <Field
            label="Your text"
            htmlFor="text"
            hint={<span className={cn(!valid && words > 0 && "text-warn")}>{words.toLocaleString()} words · {refinement.minWords}–{refinement.maxWords.toLocaleString()} per order</span>}
          >
            <Textarea id="text" rows={14} className="font-serif text-[15.5px] leading-[1.8]" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Field label="Instructions (optional)" htmlFor="instructions" hint="E.g. British spelling, keep it formal, focus on paragraphs 2–3.">
            <Textarea id="instructions" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={refinement.maxInstructionChars} />
          </Field>
        </Card>
      </div>
      <div className="space-y-5 lg:sticky lg:top-8 lg:self-start">
        <Card strong className="p-5 sm:p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-violet">Writing review</p>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-[14px]">Estimated price</span>
            <span className="text-2xl font-semibold">{formatHKD(refinementPrice(Math.max(words, 1)))}</span>
          </div>
          <p className="mt-1 text-[12px] text-fg-subtle">
            {formatHKD(refinementPricing.perBlock)} per {refinementPricing.blockWords} words · minimum {formatHKD(refinementPricing.minimum)}. Final price is confirmed by the server.
          </p>
          <ul className="mt-4 space-y-2 border-t border-[var(--line)] pt-4 text-[12.5px] text-fg-muted">
            <li>Clarity, flow and natural phrasing</li>
            <li>Meaning, facts and citations preserved</li>
            <li>Your voice kept where possible</li>
            <li>Original and revised text side by side</li>
          </ul>
          <div className="mt-5">
            <Checkbox id="integrity" checked={integrity} onChange={setIntegrity}>
              This is my own writing. I understand the review improves clarity and does not disguise authorship.
            </Checkbox>
          </div>
          <div className="mt-5"><FormMessage>{error}</FormMessage></div>
          <Button type="submit" size="lg" className="mt-3 w-full" loading={loading}>Continue to payment</Button>
        </Card>
      </div>
    </form>
  );
}
