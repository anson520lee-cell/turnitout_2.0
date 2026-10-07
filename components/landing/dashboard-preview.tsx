"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, FileCheck2, FileStack, LayoutGrid, ScanText, Wallet } from "lucide-react";
import { Container, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";
import { Badge, type Tone } from "@/components/ui/badge";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The dashboard, shown as a live scene instead of a flat screenshot. A glass
 * frame leans gently with the cursor, a rim of light runs round it, and its
 * parts sit a few pixels apart in depth: the cards just above the frame, the
 * order pipeline a touch higher, two floating notes in front. The depth is
 * kept shallow on purpose, so it reads as a calm product shot that is subtly
 * dimensional rather than a 3D toy. One example order walks through the
 * pipeline on a loop (paid, queued, screening, review, ready), and everything
 * that depends on it moves with it: the progress line, the ring, the order's
 * badge, the "reports ready" count and the note that slides in when it lands.
 *
 * Illustration with invented data, and labelled so.
 */

const STEPS = ["Paid", "Queued", "Screening", "Review", "Ready"];
const STEP_TONE: Tone[] = ["neutral", "info", "progress", "warn", "success"];
const NAV = [
  { icon: LayoutGrid, label: "Overview" },
  { icon: ScanText, label: "Free Scan" },
  { icon: FileStack, label: "Orders" },
  { icon: FileCheck2, label: "Get Report" },
  { icon: Wallet, label: "Billing & Credits" },
];
/** Depth of a layer above the frame, in px (kept small: a hint of depth, not a stack). */
const z = (px: number) => ({ transform: `translateZ(${px}px)` });

export function DashboardPreview() {
  const reduce = usePrefersReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  // 0…4 are the pipeline steps; 5 holds on "Ready" before the loop restarts
  const [tick, setTick] = useState(2);

  useEffect(() => {
    const el = root.current;
    if (!el || reduce) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (e.isIntersecting) timer = setInterval(() => setTick((t) => (t + 1) % 6), 1700);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, [reduce]);

  const step = Math.min(tick, 4);
  const ready = step === 4;
  const pct = step * 25;
  const C = 2 * Math.PI * 20;

  return (
    <section className="relative py-24 sm:py-32">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Your dashboard"
          title="Every scan and order in one place."
          body="Remaining free scans, live order status, and reports ready to open."
        />
        <Reveal className="relative mx-auto mt-16 max-w-5xl [perspective:3200px]">
          {/* light behind the frame */}
          <div aria-hidden data-depth="-1" className="pointer-events-none absolute -inset-x-[8%] -inset-y-[14%]">
            <div className="absolute left-[6%] top-[10%] size-[46%] rounded-full bg-accent/25 blur-[90px]" />
            <div className="absolute right-[4%] top-[30%] size-[42%] rounded-full bg-violet/25 blur-[100px]" />
            <div className="absolute bottom-0 left-[34%] size-[34%] rounded-full bg-cyan/15 blur-[90px]" />
          </div>

          <div
            ref={root}
            aria-hidden
            data-tilt="2.5"
            className="relative rounded-[28px] [--persp:2400px] [--rx0:3deg] [transform-style:preserve-3d] [transform:perspective(2400px)_rotateX(3deg)]"
          >
            {/* the frame: glass, and a rim of light running round it */}
            <div className="glass-strong absolute inset-0 rounded-[28px]" />
            <div className="dash-rim rounded-[28px]" />

            <div className="relative [transform-style:preserve-3d]">
              {/* window bar */}
              <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-3.5">
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/10" />
                <span className="ml-3 rounded-full border border-[var(--line)] bg-ink-900/60 px-3 py-1 font-mono text-[11px] text-fg-subtle">0% / dashboard</span>
                <span className="ml-auto flex items-center gap-2 text-[12px] text-fg-muted">
                  <span className="size-1.5 rounded-full bg-ok shadow-[0_0_8px_rgb(79_209_165/0.9)]" />
                  Live
                </span>
              </div>

              <div className="flex [transform-style:preserve-3d]">
                {/* sidebar */}
                <div className="hidden w-[200px] shrink-0 border-r border-[var(--line)] p-4 md:block" style={z(6)}>
                  <p className="px-2 text-[18px] font-semibold tracking-tight">0%</p>
                  <div className="mt-5 space-y-1">
                    {NAV.map((n, i) => (
                      <div
                        key={n.label}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px]",
                          i === 0 ? "nav-3d bg-gradient-to-b from-white/[0.11] to-white/[0.04] text-fg" : "text-fg-muted",
                        )}
                      >
                        <n.icon className={cn("size-4", i === 0 ? "text-accent" : "text-fg-subtle")} />
                        {n.label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 rounded-2xl border border-[var(--line)] bg-ink-900/60 p-3">
                    <p className="text-[11px] text-fg-subtle">Credits</p>
                    <p className="mt-0.5 text-[20px] font-semibold tracking-tight">64</p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-[64%] rounded-full bg-gradient-to-r from-cyan to-accent" />
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-1 p-4 sm:p-6 [transform-style:preserve-3d]">
                  {/* three numbers, each a card lifted off the frame */}
                  <div className="grid gap-3 sm:grid-cols-3 [transform-style:preserve-3d]">
                    <div className="dash-card" style={z(12)}>
                      <p className="text-[12px] text-fg-muted">Free scans today</p>
                      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight">
                        2 <span className="text-[13px] font-normal text-fg-subtle">of 3 left</span>
                      </p>
                      <div className="mt-3 flex gap-1.5">
                        <span className="h-1.5 flex-1 rounded-full bg-accent shadow-[0_0_10px_rgb(91_140_255/0.7)]" />
                        <span className="h-1.5 flex-1 rounded-full bg-accent shadow-[0_0_10px_rgb(91_140_255/0.7)]" />
                        <span className="h-1.5 flex-1 rounded-full bg-white/10" />
                      </div>
                    </div>
                    <div className="dash-card" style={z(16)}>
                      <p className="text-[12px] text-fg-muted">Scans this week</p>
                      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight">11</p>
                      <svg viewBox="0 0 120 26" className="mt-2 h-[26px] w-full overflow-visible">
                        <defs>
                          <linearGradient id="dash-line" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0" stopColor="#5fd8f5" />
                            <stop offset="1" stopColor="#9a7bff" />
                          </linearGradient>
                        </defs>
                        <path d="M0 21 L17 17 L34 19 L51 11 L68 14 L85 6 L102 9 L120 2" pathLength={100} fill="none" stroke="url(#dash-line)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dash-draw" />
                        <circle cx="120" cy="2" r="2.6" fill="#c9bcff" className="dash-dot" />
                      </svg>
                    </div>
                    <div className="dash-card" style={z(12)}>
                      <p className="text-[12px] text-fg-muted">Reports ready</p>
                      <p className="mt-1.5 flex items-center gap-2 text-[26px] font-semibold leading-none tracking-tight">
                        <motion.span key={ready ? "b" : "a"} initial={{ scale: 1.5, color: "#4fd1a5" }} animate={{ scale: 1, color: "#e9edf7" }} transition={{ duration: 0.6 }}>
                          {ready ? 2 : 1}
                        </motion.span>
                        {ready && <Badge tone="success" dot>New</Badge>}
                      </p>
                      <p className="mt-3 text-[11.5px] text-fg-subtle">Open them from Orders</p>
                    </div>
                  </div>

                  {/* the order in flight */}
                  <div className="dash-card mt-3" style={{ ...z(22), padding: 20 }}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">Order in progress</p>
                        <p className="mt-1 truncate text-[15px] font-medium">Sociology essay – final</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge tone={STEP_TONE[step]} dot>{STEPS[step]}</Badge>
                        <svg viewBox="0 0 48 48" className="size-12 -rotate-90">
                          <circle cx="24" cy="24" r="20" fill="none" stroke="rgb(255 255 255 / 0.09)" strokeWidth="4" />
                          <circle
                            cx="24"
                            cy="24"
                            r="20"
                            fill="none"
                            stroke={ready ? "#4fd1a5" : "#5b8cff"}
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeDasharray={C}
                            strokeDashoffset={C * (1 - Math.max(0.03, pct / 100))}
                            className="transition-[stroke-dashoffset,stroke] duration-700 ease-out"
                          />
                        </svg>
                      </div>
                    </div>
                    <div className="relative mt-6">
                      <div className="absolute inset-x-[10%] top-[7px] h-[2px] rounded-full bg-white/10" />
                      <div className="absolute left-[10%] top-[7px] h-[2px] w-[80%]">
                        <div
                          className="dash-flow h-full rounded-full bg-gradient-to-r from-cyan via-accent to-violet shadow-[0_0_14px_rgb(91_140_255/0.9)] transition-[width] duration-700 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <ol className="relative grid grid-cols-5">
                        {STEPS.map((s, i) => (
                          <li key={s} className="flex flex-col items-center gap-2">
                            <span
                              className={cn(
                                "relative grid size-4 place-items-center rounded-full border transition-colors duration-500",
                                i < step && "border-accent bg-accent",
                                i === step && (ready ? "border-ok bg-ok" : "border-accent bg-ink-900"),
                                i > step && "border-white/20 bg-ink-900",
                              )}
                            >
                              {i === step && !ready && <span className="dash-ping absolute inset-0 rounded-full border border-accent" />}
                              {(i < step || (i === step && ready)) && <Check className="size-2.5 text-white" strokeWidth={3.5} />}
                            </span>
                            <span className={cn("text-[11px] transition-colors duration-500", i <= step ? "text-fg" : "text-fg-subtle")}>{s}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  {/* the list */}
                  <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-ink-900/50" style={z(8)}>
                    {[
                      { t: "Sociology essay – final", tone: STEP_TONE[step], s: STEPS[step] },
                      { t: "Lab report 3", tone: "success" as Tone, s: "Ready" },
                      { t: "Literature review", tone: "info" as Tone, s: "Queued" },
                    ].map((r) => (
                      <div key={r.t} className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0">
                        <span className="truncate text-[13.5px]">{r.t}</span>
                        <Badge tone={r.tone} dot>{r.s}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* in front of everything: a note when the report lands, hanging off the
                bottom-right corner so it never covers the stat cards */}
            <div className="pointer-events-none absolute -bottom-7 right-4 hidden lg:block xl:-right-6" style={z(40)}>
              <AnimatePresence>
                {ready && (
                  <motion.div
                    initial={{ opacity: 0, x: 30, scale: 0.94 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 30, scale: 0.94 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="glass-strong flex items-center gap-3 rounded-2xl px-4 py-3 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9),0_0_40px_-10px_rgb(79_209_165/0.5)]"
                  >
                    <span className="grid size-8 place-items-center rounded-xl bg-ok/15 text-ok">
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                    <span>
                      <span className="block text-[13px] font-medium">Report ready</span>
                      <span className="block text-[11.5px] text-fg-subtle">Sociology essay – final</span>
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {/* and a result from the free scan, hanging off the bottom-left
                corner below the sidebar's Credits box rather than over it */}
            <div className="pointer-events-none absolute -bottom-7 left-4 hidden lg:block xl:-left-8" style={z(34)}>
              <div className="chip-float glass-strong w-[190px] rounded-2xl p-3.5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9)]">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-fg-muted">Free scan</span>
                  <Badge tone="success" dot>Low</Badge>
                </div>
                <div className="mt-3 space-y-1.5">
                  {[34, 22, 46, 18].map((w, i) => (
                    <div key={i} className="h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan to-accent" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-14 text-center text-[12px] text-fg-subtle">Illustration with example data.</p>
        </Reveal>
      </Container>
    </section>
  );
}
