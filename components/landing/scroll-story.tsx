"use client";
import { useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Container, Eyebrow } from "@/components/ui/section";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";

const stages = [
  { label: "Preliminary scan", body: "Your text enters our analysis layer. Instant and free." },
  { label: "Writing signals", body: "Sentence rhythm, transitions, phrasing and structure are measured and explained." },
  { label: "Request screening", body: "If you need an actual result, request a screening and upload the document." },
  { label: "Verification", body: "A reviewer runs a Turnitin screening with repository storage off." },
  { label: "Screening complete", body: "The returned result and report arrive in your dashboard." },
];

const SIGNALS = [
  { t: "Sentence variation", x: "-38%", y: "-26%" },
  { t: "Transitions", x: "36%", y: "-12%" },
  { t: "Phrase uniformity", x: "-36%", y: "10%" },
  { t: "Structure", x: "34%", y: "24%" },
];

function useRange(p: MotionValue<number>, a: number, b: number) {
  return useTransform(p, [a, b], [0, 1], { clamp: true });
}

function Stage({ progress }: { progress: MotionValue<number> }) {
  const docIn = useRange(progress, 0.0, 0.12);
  const signals = useRange(progress, 0.18, 0.32);
  const signalsOut = useTransform(progress, [0.55, 0.65], [1, 0]);
  const layer = useRange(progress, 0.4, 0.52);
  const through = useRange(progress, 0.56, 0.74);
  const report = useRange(progress, 0.78, 0.9);

  const docOpacity = useTransform([docIn, report] as never, ([a, r]: number[]) => a * (1 - r));
  const docY = useTransform(docIn, [0, 1], [60, 0]);
  const docZ = useTransform(through, [0, 1], [0, -260]);
  const docRotX = useTransform(through, [0, 1], [10, 24]);
  const layerZ = useTransform(through, [0, 1], [-120, 40]);
  const layerOpacity = useTransform([layer, report] as never, ([l, r]: number[]) => l * 0.9 * (1 - r));
  const sigOpacity = useTransform([signals, signalsOut] as never, ([a, b]: number[]) => a * b);
  const reportScale = useTransform(report, [0, 1], [0.92, 1]);
  const ring = useTransform(report, [0, 1], [0, 1]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px] [perspective:1100px]">
      <div aria-hidden className="absolute inset-[-10%] rounded-full bg-[radial-gradient(closest-side,rgb(91_140_255/0.18),transparent)]" />
      {/* verification field */}
      <motion.div
        style={{ opacity: layerOpacity, z: layerZ, rotateX: 64 }}
        className="absolute left-[8%] right-[8%] top-[46%] h-[48%] rounded-[28px] border border-accent/40 bg-[linear-gradient(180deg,rgb(91_140_255/0.18),rgb(154_123_255/0.05))] shadow-[0_0_60px_rgb(91_140_255/0.35)] [transform-style:preserve-3d]"
      >
        <div className="absolute inset-0 rounded-[28px] bg-grid opacity-70" />
      </motion.div>
      {/* document */}
      <motion.div
        style={{ opacity: docOpacity, y: docY, z: docZ, rotateX: docRotX, rotateY: -12 }}
        className="glass-strong absolute left-[26%] top-[12%] h-[70%] w-[48%] rounded-2xl p-[5%] [transform-style:preserve-3d]"
      >
        <div className="space-y-2.5">
          {[90, 96, 72, 88, 0, 93, 80, 95, 64, 0, 86, 91].map((w, i) =>
            w ? (
              <div key={i} className={cn("h-[5px] rounded-full", i === 2 || i === 7 ? "bg-violet/70" : "bg-[#c6d3ff]/25")} style={{ width: `${w}%` }} />
            ) : (
              <div key={i} className="h-2" />
            ),
          )}
        </div>
      </motion.div>
      {/* signal labels */}
      {SIGNALS.map((s, i) => (
        <motion.div
          key={s.t}
          style={{ opacity: sigOpacity, left: `calc(50% + ${s.x})`, top: `calc(50% + ${s.y})` }}
          className="absolute"
        >
          <div className="glass flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-muted">
            <span className={cn("size-1.5 rounded-full", i % 2 ? "bg-violet" : "bg-cyan")} />
            {s.t}
          </div>
        </motion.div>
      ))}
      {/* report card */}
      <motion.div
        style={{ opacity: report, scale: reportScale }}
        className="glass-strong absolute inset-[12%] rounded-3xl p-6"
      >
        <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ok">Screening complete</p>
        <div className="mt-5 grid grid-cols-2 gap-4">
          {["AI-writing indicator", "Similarity"].map((l) => (
            <div key={l} className="rounded-2xl border border-[var(--line)] bg-ink-900/60 p-4">
              <svg viewBox="0 0 60 60" className="size-14" aria-hidden>
                <circle cx="30" cy="30" r="24" fill="none" stroke="rgb(148 163 255 / 0.12)" strokeWidth="6" />
                <motion.circle
                  cx="30" cy="30" r="24" fill="none" stroke="url(#ss-grad)" strokeWidth="6" strokeLinecap="round"
                  style={{ pathLength: ring }} transform="rotate(-90 30 30)"
                />
                <defs>
                  <linearGradient id="ss-grad"><stop offset="0" stopColor="#5fd8f5" /><stop offset="1" stopColor="#9a7bff" /></linearGradient>
                </defs>
              </svg>
              <p className="mt-3 text-[12px] text-fg-muted">{l}</p>
              <div className="mt-1.5 h-2 w-12 rounded bg-white/10" />
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-2 w-3/4 rounded bg-white/[0.07]" />
          <div className="h-2 w-1/2 rounded bg-white/[0.07]" />
        </div>
        <p className="mt-5 text-[11px] text-fg-subtle">Illustration. Values appear only after a real screening.</p>
      </motion.div>
    </div>
  );
}

export function ScrollStory() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setActive(Math.min(stages.length - 1, Math.floor(v * stages.length * 0.999)));
  });

  if (reduce) {
    return (
      <section ref={ref} className="py-24">
        <Container>
          <Eyebrow>From draft to report</Eyebrow>
          <ol className="mt-8 grid gap-4 md:grid-cols-5">
            {stages.map((s, i) => (
              <li key={s.label} className="glass rounded-2xl p-5">
                <span className="font-mono text-[11px] text-fg-subtle">0{i + 1}</span>
                <h3 className="mt-2 font-semibold">{s.label}</h3>
                <p className="mt-1 text-[13px] text-fg-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative h-[420vh]" aria-label="From draft to report">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <Container className="grid items-center gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div className="order-2 lg:order-1">
            <Eyebrow>From draft to report</Eyebrow>
            <ol className="mt-6 space-y-1">
              {stages.map((s, i) => (
                <li key={s.label}>
                  <motion.div
                    animate={{ opacity: i === active ? 1 : 0.32 }}
                    transition={{ duration: 0.4 }}
                    className="flex gap-4 rounded-xl py-3"
                  >
                    <span className={cn("mt-2 h-px w-6 shrink-0 transition-all duration-500", i === active ? "w-10 bg-accent" : "bg-fg-subtle/50")} />
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight sm:text-xl">{s.label}</h3>
                      <motion.p
                        initial={false}
                        animate={{ height: i === active ? "auto" : 0, opacity: i === active ? 1 : 0 }}
                        className="overflow-hidden text-[14.5px] leading-relaxed text-fg-muted"
                      >
                        <span className="block pt-1.5">{s.body}</span>
                      </motion.p>
                    </div>
                  </motion.div>
                </li>
              ))}
            </ol>
          </div>
          <div className="order-1 lg:order-2">
            <Stage progress={scrollYProgress} />
          </div>
        </Container>
      </div>
    </section>
  );
}
