"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/section";
import { WaitingAnimation } from "@/components/ui/waiting";
import { cn } from "@/lib/utils";

/**
 * A design-review page, not part of the product: it just replays the same
 * WaitingAnimation each real flow uses (with that flow's own title/steps),
 * so it can be looked at without a working scan/order backend behind it.
 * Not linked from navigation; reachable only by visiting the URL directly.
 */
const FLOWS = [
  {
    key: "scan",
    label: "Free scan",
    title: "Scanning your writing…",
    steps: ["Segmenting sentences", "Measuring rhythm and structure", "Checking phrasing patterns", "Preparing your report"],
    note: "This usually takes a few seconds. Please keep this window open.",
  },
  {
    key: "report",
    label: "Report",
    title: "Creating your report request…",
    steps: ["Counting words", "Checking the length", "Creating your order", "Preparing payment options"],
    note: "Please wait and keep this window open. You'll be taken to payment in a moment.",
  },
  {
    key: "refinement",
    label: "Writing refinement",
    title: "Creating your refinement order…",
    steps: ["Counting characters", "Working out the price", "Creating your order", "Preparing payment options"],
    note: "Please wait and keep this window open. You'll be taken to payment in a moment.",
  },
];

export default function AnimationPreviewPage() {
  const [active, setActive] = useState(0);
  const flow = FLOWS[active];

  return (
    <div className="relative py-16 sm:py-24">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(50%_60%_at_50%_0%,rgb(91_140_255/0.14),transparent_70%)]" />
      <Container className="relative flex max-w-lg flex-col items-center gap-6 text-center">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-subtle hover:text-fg">
          <ArrowLeft className="size-3.5" /> Back home
        </Link>
        <h1 className="sr-only">Loading animation preview</h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Design preview · not a real scan or order</p>
        <div className="flex flex-wrap justify-center gap-2">
          {FLOWS.map((f, i) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-[13px] transition",
                i === active ? "border-accent/60 bg-accent/15 text-fg" : "border-[var(--line)] text-fg-muted hover:text-fg",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="glass-strong noise w-full rounded-3xl px-5 py-4 sm:px-7">
          <WaitingAnimation key={flow.key} title={flow.title} steps={flow.steps} note={flow.note} />
        </div>
        <p className="max-w-sm text-[12.5px] text-fg-subtle">
          This just replays the loading animation free scan, report and writing refinement each show while working. It never runs a real scan or creates an order.
        </p>
      </Container>
    </div>
  );
}
