"use client";
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { NeuralWaitVisual } from "@/components/ui/neural-wait-visual";
import { HudCorners } from "@/components/ui/hud";
import { REFINE_INTRO_MS } from "@/lib/auto-report/refine-script";
import { REWRITE_BATCH, lockedIn, numbersIn, pickFlagged, type ReportRewrite } from "@/lib/auto-report/rewrite";
import type { AutoReportResult } from "@/lib/auto-report/stitch";
import { cn } from "@/lib/utils";

/**
 * The opening sequence (20 seconds, 1.2 times shorter than the report scan's) before the live rewrite: the same
 * network "tunnel" while the steps tick off. Every detail line is counted from the report and the flagged
 * sentences, or read from the real request (whether the suggestions are back).
 */

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

export function RefineIntro({ result, rewrite, reference, original, now }: { result: AutoReportResult; rewrite: ReportRewrite | null; reference: string; original: number; now: number }) {
  const facts = useMemo(() => {
    const picked = pickFlagged(result);
    let numbers = 0;
    let locked = 0;
    for (const s of picked) {
      numbers += numbersIn(s.text).length;
      locked += lockedIn(s.text).length;
    }
    return {
      picked: picked.length,
      flagged: result.summary.high + result.summary.medium,
      reasons: picked.filter((s) => s.why).length,
      high: picked.filter((s) => s.risk === "high").length,
      medium: picked.filter((s) => s.risk === "medium").length,
      numbers,
      locked,
      batches: Math.ceil(picked.length / REWRITE_BATCH),
    };
  }, [result]);
  const back = rewrite ? rewrite.items.filter((i) => i.rewrite).length : 0;

  const steps = [
    { at: 0, title: "Opening your report", lines: [`${reference} · AI score ${Math.round(original * 100)}%`, `${plural(facts.flagged, "flagged sentence")} · ${fmt(facts.picked)} to rewrite`] },
    { at: 2_200, title: "Loading the rewrite engine", lines: ["0% Writing Refinement · plain student voice, re-checked", "numbers, names and citations checked against your original"] },
    { at: 5_200, title: "Reading why each sentence was flagged", lines: [`${plural(facts.reasons, "reviewer reason")} loaded`, `${fmt(facts.high)} high · ${fmt(facts.medium)} medium`] },
    {
      at: 8_300,
      title: "Locking what must not change",
      lines: [
        facts.numbers || facts.locked ? `${plural(facts.numbers, "number")} · ${plural(facts.locked, "citation or quotation", "citations or quotations")} locked` : "no numbers, citations or quotations to lock",
        "names, hedges and meaning kept as written",
      ],
    },
    {
      at: 11_200,
      title: "Dispatching the writer",
      lines: [
        `${plural(facts.batches, "batch", "batches")} of up to ${REWRITE_BATCH} sentences`,
        rewrite ? `${plural(back, "suggestion")} back · ${fmt(rewrite.items.length - back)} kept as written` : "writer drafting your suggestions",
        "3 rewrite agents standing by",
      ],
    },
    { at: 15_300, title: "Opening live rewrite", lines: ["erasing and retyping each flagged sentence over your text"] },
  ];
  const active = steps.reduce((i, s, k) => (now >= s.at ? k : i), 0);
  const pct = Math.min(100, (now / REFINE_INTRO_MS) * 100);
  const secs = Math.max(0, Math.ceil((REFINE_INTRO_MS - now) / 1000));

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative mx-auto w-full max-w-5xl flex-1 px-4 pb-6 pt-4 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[#9b7bff]/25 bg-ink-950/60">
          <HudCorners />
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(45%_60%_at_50%_45%,rgb(124_108_255/0.26),transparent_70%)]" />
          <div aria-hidden className="scan-intro-grid absolute inset-0 opacity-60" />
          <NeuralWaitVisual className="relative h-[34vh] min-h-[200px] w-full sm:h-[40vh]" />
          <div aria-hidden className="refine-intro-warp pointer-events-none absolute inset-0" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-3 font-mono text-[10.5px] uppercase tracking-[0.2em] text-fg-subtle">
            <span className="flex items-center gap-2 text-[#b9a8ff]">
              <span className="refine-live-dot" aria-hidden /> 0% Writing Refinement
            </span>
            <span>{reference}</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 px-5 pb-4">
            <AnimatePresence mode="wait">
              <motion.p
                key={active}
                initial={{ opacity: 0, x: 40, filter: "blur(6px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: -40, filter: "blur(6px)" }}
                transition={{ duration: 0.28 }}
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
                <li key={s.title} className={cn("flex items-center gap-3 rounded-lg px-3 py-1.5 transition", state === "run" && "bg-[#9b7bff]/10", state === "todo" && "opacity-35")}>
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border",
                      state === "done" ? "border-[#9b7bff]/50 bg-[#9b7bff]/15 text-[#cdbdff]" : state === "run" ? "border-[#9b7bff]/60 text-[#b9a8ff]" : "border-[var(--line-strong)]",
                    )}
                  >
                    {state === "done" ? <Check className="size-3" /> : state === "run" ? <span className="scan-spinner" aria-hidden /> : null}
                  </span>
                  <span className={cn("text-[13.5px]", state === "run" ? "text-fg" : "text-fg-muted")}>{s.title}</span>
                  {state === "done" && <span className="ml-auto font-mono text-[10.5px] text-[#cdbdff]/80">OK</span>}
                </li>
              );
            })}
          </ol>
          <div className="rounded-2xl border border-[var(--line)] bg-ink-950/70 p-4 font-mono text-[11.5px] leading-relaxed">
            <p className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-fg-subtle">
              <span>refine.log</span>
              <span>T-{String(secs).padStart(2, "0")}s</span>
            </p>
            <div className="space-y-0.5">
              {steps.slice(0, active + 1).flatMap((s, i) =>
                s.lines.map((l, k) => {
                  const visible = i < active || now - s.at > 300 + k * 350;
                  if (!visible) return null;
                  return (
                    <p key={`${i}-${k}`} className={cn("scan-type truncate", i === active ? "text-[#c4b5ff]" : "text-fg-subtle")}>
                      <span className="text-fg-subtle/60">{k === 0 ? "›" : " "} </span>
                      {l}
                      {i < active && k === s.lines.length - 1 && <span className="text-[#cdbdff]"> ✓</span>}
                    </p>
                  );
                }),
              )}
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="refine-bar h-full rounded-full bg-gradient-to-r from-accent via-[#7c7cff] to-[#9b7bff] transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
