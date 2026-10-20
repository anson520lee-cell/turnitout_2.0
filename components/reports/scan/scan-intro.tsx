"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { NeuralWaitVisual } from "@/components/ui/neural-wait-visual";
import { HudCorners } from "@/components/ui/hud";
import { reportPricing } from "@/config/pricing";
import { INTRO_MS, type ScanPlan } from "@/lib/auto-report/scan-script";
import { cn } from "@/lib/utils";
import type { ReportFeed } from "./use-report-feed";

/**
 * The opening sequence (about 24 seconds) before the live scan: the network
 * "tunnel" turns while the hand-over steps tick off one by one. Every detail
 * line is counted from the customer's text or read from the real run (how many
 * sections the reviewer has returned).
 */

const AGENTS = 4;
const fmt = (n: number) => n.toLocaleString("en-US");

interface Step {
  at: number;
  title: string;
  lines: string[];
}

export function ScanIntro({ plan, text, feed, reference, startedAt, now }: { plan: ScanPlan; text: string; feed: ReportFeed; reference: string; startedAt: number; now: number }) {
  const elapsed = Math.max(0, now - startedAt);

  const checks = useMemo(() => {
    const letters = text.match(/\p{L}/gu)?.length ?? 0;
    const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
    const english = letters > 0 && latin / letters > 0.9;
    const seen = new Set<string>();
    let dups = 0;
    for (const x of plan.sentences) {
      const k = x.text.toLowerCase().replace(/\s+/g, " ");
      if (k.length > 20 && seen.has(k)) dups += 1;
      seen.add(k);
    }
    const readable = !/[�\u0000-\u0008\u000E-\u001F]/.test(text);
    return { english, dups, readable };
  }, [plan, text]);

  const inRange = plan.chars >= reportPricing.minChars && plan.chars <= reportPricing.maxChars;
  const steps: Step[] = [
    { at: 0, title: "Establishing secure session", lines: [`${reference} · encrypted connection`, "private workspace allocated"] },
    { at: 2600, title: "Matching pattern engine", lines: [`0% Pattern Engine · ${checks.english ? "English prose profile" : "mixed-script profile"}`, "sentence and paragraph signals loaded"] },
    { at: 6200, title: "Handing over your document", lines: [`${fmt(plan.chars)} characters · ${fmt(plan.words)} words`, `${plan.paragraphs.length} paragraphs · ${plan.sentences.length} sentences`] },
    { at: 10_000, title: "Segmenting into review sections", lines: [`${plan.pieces} section${plan.pieces === 1 ? "" : "s"} of up to about 3,500 characters`, "cut at paragraph and sentence boundaries"] },
    {
      at: 13_400,
      title: "Running preliminary checks",
      lines: [
        `length ${inRange ? "within" : "outside"} ${fmt(reportPricing.minChars)}–${fmt(reportPricing.maxChars)} characters`,
        `${plan.sentences.length} sentence boundaries found`,
        checks.readable ? "characters readable" : "some unusual characters skipped",
        checks.dups ? `${checks.dups} repeated sentence${checks.dups === 1 ? "" : "s"} noted` : "no repeated sentences",
      ],
    },
    {
      at: 18_400,
      title: "Dispatching reviewer",
      lines: [
        feed.paused
          ? "reviewer queue busy · waiting for a free slot"
          : `${feed.total ? `${feed.reviewed}/${feed.total}` : `0/${plan.pieces}`} sections returned`,
        `${AGENTS} scan agents standing by`,
      ],
    },
    { at: 21_600, title: "Opening live scan", lines: ["replaying the reviewer's findings over your text"] },
  ];
  const active = steps.reduce((i, s, k) => (elapsed >= s.at ? k : i), 0);
  const pct = Math.min(100, (elapsed / INTRO_MS) * 100);
  const secs = Math.max(0, Math.ceil((INTRO_MS - elapsed) / 1000));

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative mx-auto w-full max-w-5xl flex-1 px-4 pb-6 pt-4 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--line-strong)] bg-ink-950/60">
          <HudCorners />
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(45%_60%_at_50%_45%,rgb(91_140_255/0.22),transparent_70%)]" />
          <div aria-hidden className="scan-intro-grid absolute inset-0 opacity-60" />
          <NeuralWaitVisual className="relative h-[34vh] min-h-[200px] w-full sm:h-[40vh]" />
          <Fragments plan={plan} on={active >= 2 && active <= 3} />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-3 font-mono text-[10.5px] uppercase tracking-[0.2em] text-fg-subtle">
            <span className="flex items-center gap-2 text-accent">
              <span className="scan-live-dot" aria-hidden /> 0% Pattern Engine
            </span>
            <span>{reference}</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 px-5 pb-4">
            <AnimatePresence mode="wait">
              <motion.p
                key={active}
                initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                transition={{ duration: 0.35 }}
                className="text-center text-[18px] font-semibold tracking-tight sm:text-[22px]"
              >
                {steps[active].title}
                <span className="scan-ellipsis" aria-hidden />
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <ol className="space-y-1.5" aria-live="polite">
            {steps.map((s, i) => {
              const state = i < active ? "done" : i === active ? "run" : "todo";
              return (
                <li key={s.title} className={cn("flex items-center gap-3 rounded-lg px-3 py-1.5 transition", state === "run" && "bg-accent/10", state === "todo" && "opacity-35")}>
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border",
                      state === "done" ? "border-ok/50 bg-ok/15 text-ok" : state === "run" ? "border-accent/60 text-accent" : "border-[var(--line-strong)]",
                    )}
                  >
                    {state === "done" ? <Check className="size-3" /> : state === "run" ? <span className="scan-spinner" aria-hidden /> : null}
                  </span>
                  <span className={cn("text-[13.5px]", state === "run" ? "text-fg" : "text-fg-muted")}>{s.title}</span>
                  {state === "done" && <span className="ml-auto font-mono text-[10.5px] text-ok/80">OK</span>}
                </li>
              );
            })}
          </ol>
          <div className="rounded-2xl border border-[var(--line)] bg-ink-950/70 p-4 font-mono text-[11.5px] leading-relaxed">
            <p className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-fg-subtle">
              <span>handover.log</span>
              <span>T-{String(secs).padStart(2, "0")}s</span>
            </p>
            <div className="space-y-0.5">
              {steps.slice(0, active + 1).flatMap((s, i) =>
                s.lines.map((l, k) => {
                  const visible = i < active || elapsed - s.at > 350 + k * 420;
                  if (!visible) return null;
                  return (
                    <p key={`${i}-${k}`} className={cn("scan-type truncate", i === active ? "text-cyan" : "text-fg-subtle")}>
                      <span className="text-fg-subtle/60">{k === 0 ? "›" : " "} </span>
                      {l}
                      {i < active && k === s.lines.length - 1 && <span className="text-ok"> ✓</span>}
                    </p>
                  );
                }),
              )}
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-accent via-cyan to-violet transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Words from the customer's own first sentences drifting into the tunnel while the document is handed over. */
function Fragments({ plan, on }: { plan: ScanPlan; on: boolean }) {
  const words = useMemo(() => plan.sentences.slice(0, 6).flatMap((s) => s.words).filter((w) => w.length > 3).slice(0, 14), [plan]);
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setSeed((x) => x + 1), 1900);
    return () => clearInterval(t);
  }, [on]);
  if (!on || !words.length) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {words.map((w, i) => {
        const angle = ((i * 137.5 + seed * 23) % 360) * (Math.PI / 180);
        return (
          <span
            key={`${seed}-${i}`}
            className="scan-fragment absolute left-1/2 top-[42%] whitespace-nowrap font-mono text-[12px] text-cyan/90"
            style={{ ["--fx" as string]: `${Math.cos(angle) * 46}vw`, ["--fy" as string]: `${Math.sin(angle) * 22}vh`, animationDelay: `${(i % 7) * 160}ms` }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
}
