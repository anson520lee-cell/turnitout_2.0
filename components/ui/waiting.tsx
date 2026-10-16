"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, } from "framer-motion";
import { cn } from "@/lib/utils";
import { NeuralWaitVisual } from "@/components/ui/neural-wait-visual";

/**
 * The "please wait" state: a small network running a forward pass in 3D
 * (NeuralWaitVisual), a progress shimmer and step text that cycles. Used by the paste dialog while a
 * request runs and by the order page while a report is being prepared.
 */
export function WaitingAnimation({
  title,
  steps,
  note,
  className,
  stepMs = 1400,
}: {
  title: string;
  steps: string[];
  note?: string;
  className?: string;
  stepMs?: number;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (steps.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % steps.length), stepMs);
    return () => clearInterval(t);
  }, [steps.length, stepMs]);

  const progress = `${Math.round(((i + 1) / steps.length) * 100)}%`;

  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center py-6 text-center", className)}>
      <NeuralWaitVisual className="h-48 w-full max-w-[24rem]" />
      <p className="mt-7 text-[17px] font-semibold tracking-tight">{title}</p>
      <div className="mt-1.5 flex h-5 items-center gap-2 text-[13.5px] text-fg-muted">
        <AnimatePresence mode="wait">
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="inline-block"
          >
            {steps[i]}
          </motion.span>
        </AnimatePresence>
        <span className="flex items-center gap-1" aria-hidden>
          <span className="waiting-dot size-1 rounded-full bg-accent" style={{ animationDelay: "0ms" }} />
          <span className="waiting-dot size-1 rounded-full bg-accent" style={{ animationDelay: "160ms" }} />
          <span className="waiting-dot size-1 rounded-full bg-accent" style={{ animationDelay: "320ms" }} />
        </span>
      </div>
      <div className="mt-5 h-1.5 w-56 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="relative h-full rounded-full bg-gradient-to-r from-accent via-cyan to-violet"
          initial={false}
          animate={{ width: progress }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="skeleton absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        </motion.div>
      </div>
      {note && <p className="mt-5 max-w-sm text-[12.5px] text-fg-subtle">{note}</p>}
    </div>
  );
}
