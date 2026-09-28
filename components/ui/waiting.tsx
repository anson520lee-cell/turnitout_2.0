"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, } from "framer-motion";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The "please wait" state: a 3D document with a scan beam, a progress
 * shimmer and step text that cycles. Used by the paste dialog while a
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
  const reduce = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (steps.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % steps.length), stepMs);
    return () => clearInterval(t);
  }, [steps.length, stepMs]);

  const progress = `${Math.round(((i + 1) / steps.length) * 100)}%`;

  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center py-6 text-center", className)}>
      <div className="orbit-stage relative size-44" aria-hidden>
        <div className="absolute inset-[-30%] rounded-full bg-[radial-gradient(closest-side,rgb(91_140_255/0.35),transparent)] blur-xl motion-safe:animate-pulse" />
        <div className="engine-spin waiting-halo absolute inset-0 rounded-full [--spin:6s]" />
        <div className="orbit-rig absolute inset-0">
          <div className="orbit-ring size-full [--spin:11s]" />
          <div className="orbit-ring size-[64%] [--spin:16s] [--tiltx:-24deg]" />
        </div>
        <motion.div
          className="glass-strong absolute left-1/2 top-1/2 h-36 w-28 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl p-3 [transform-style:preserve-3d]"
          animate={reduce ? undefined : { rotateY: [-18, 18, -18], rotateX: [10, 4, 10] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="space-y-2">
            {[86, 94, 72, 90, 64, 0, 88, 80, 93, 58].map((w, k) =>
              w ? (
                <div key={k} className={cn("h-[4px] rounded-full", k === 3 || k === 7 ? "bg-violet/70" : "bg-[#c6d3ff]/25")} style={{ width: `${w}%` }} />
              ) : (
                <div key={k} className="h-1" />
              ),
            )}
          </div>
          <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-cyan/20 to-cyan/70 motion-safe:animate-scan [--scan-distance:360%]" style={{ boxShadow: "0 10px 26px -6px rgb(95 216 245 / 0.6)" }} />
        </motion.div>
      </div>
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
