"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The agent's console beside the hero document: a live run log (the read-outs
 * that used to float around the page as chips: similarity, flagged spans,
 * the agent revising, attention, embeddings) streaming in forever, over a
 * strip of model metrics that keep ticking. Decorative and illustrative:
 * the numbers are generated here, not measured from any text.
 */

type Tone = "ok" | "warn" | "run" | "dim" | "cmd";
type Line = { id: number; tone: Tone; tag: string; body: string; t: string };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** One pass of the agent over a document; called again and again with fresh numbers. */
function pass(n: number): Omit<Line, "id" | "t">[] {
  const tok = Math.round(rnd(900, 2400));
  const spans = Math.floor(rnd(1, 4));
  const total = Math.round(rnd(32, 58));
  const doc = pick(["essay.md", "lit-review.md", "lab-report.md", "draft-v3.md", "chapter-2.md"]);
  const out: Omit<Line, "id" | "t">[] = [
    { tone: "cmd", tag: "$", body: `agent run --doc ${doc} --mode review` },
    { tone: "ok", tag: "load", body: `${tok.toLocaleString("en-US")} tokens · ${total} sentences` },
    { tone: "ok", tag: "embed", body: "768-d · cosine index ready" },
    { tone: "ok", tag: "attention", body: `8 heads × 12 layers · ctx ${Math.min(4096, tok + 512)}` },
    { tone: "ok", tag: "similarity", body: `${rnd(0, 0.4).toFixed(1)}% · 0 sources matched` },
    { tone: "warn", tag: "flagged", body: `${spans} span${spans > 1 ? "s" : ""} · conf ${rnd(0.58, 0.83).toFixed(2)}` },
  ];
  for (let s = 1; s <= spans; s++) {
    out.push({ tone: "run", tag: "agent", body: `revising span ${s}/${spans}` });
  }
  out.push({ tone: "ok", tag: "agent", body: `${spans} edit${spans > 1 ? "s" : ""} suggested · flow ↑` });
  out.push({ tone: "ok", tag: "estimate", body: `6 signals → 1 estimate · run #${n}` });
  return out;
}

const TONE: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-violet",
  run: "text-cyan",
  dim: "text-fg-subtle",
  cmd: "text-accent",
};
const MARK: Record<Tone, string> = { ok: "✓", warn: "▲", run: "↻", dim: "·", cmd: "" };
const KEEP = 9;

const FIRST: Line[] = [
  { tone: "cmd", tag: "$", body: "agent run --doc essay.md --mode review" },
  { tone: "ok", tag: "load", body: "1,284 tokens · 41 sentences" },
  { tone: "ok", tag: "embed", body: "768-d · cosine index ready" },
  { tone: "ok", tag: "attention", body: "8 heads × 12 layers · ctx 1796" },
  { tone: "ok", tag: "similarity", body: "0.0% · 0 sources matched" },
  { tone: "warn", tag: "flagged", body: "2 spans · conf 0.71" },
  { tone: "run", tag: "agent", body: "revising span 1/2" },
  { tone: "run", tag: "agent", body: "revising span 2/2" },
  { tone: "ok", tag: "agent", body: "2 edits suggested · flow ↑" },
].map((l, i) => ({ ...(l as Omit<Line, "id" | "t">), id: i, t: `00:0${i}.${(i * 3) % 10}` }));

function useTicker(on: boolean) {
  // The first screen is fixed (server and browser must render the same thing); the stream takes over from there.
  const [lines, setLines] = useState<Line[]>(FIRST);
  const [m, setM] = useState({ ppl: 38.2, burst: 0.64, loss: 0.214, tps: 1.9, lat: 182, gpu: 63, step: 1204 });
  const [hist, setHist] = useState<number[]>(() => Array.from({ length: 24 }, (_, i) => 0.62 - i * 0.017 + ((i * 7) % 5) * 0.008));
  const seq = useRef({ queue: [] as Omit<Line, "id" | "t">[], run: 2, id: 100, clock: 9.3 });

  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      const s = seq.current;
      if (!s.queue.length) s.queue = pass(s.run++);
      const next = s.queue.shift()!;
      s.clock += rnd(0.3, 0.9);
      const mm = Math.floor(s.clock / 60);
      const ss = (s.clock % 60).toFixed(1).padStart(4, "0");
      setLines((ls) => [...ls, { ...next, id: s.id++, t: `${String(mm).padStart(2, "0")}:${ss}` }].slice(-KEEP));
      setM((p) => ({
        ppl: +(p.ppl + rnd(-1.2, 1.1)).toFixed(1),
        burst: +Math.min(0.9, Math.max(0.4, p.burst + rnd(-0.03, 0.03))).toFixed(2),
        loss: +Math.max(0.08, p.loss * rnd(0.985, 1.006)).toFixed(3),
        tps: +Math.max(1.2, Math.min(2.6, p.tps + rnd(-0.15, 0.15))).toFixed(1),
        lat: Math.round(Math.max(120, Math.min(260, p.lat + rnd(-14, 14)))),
        gpu: Math.round(Math.max(38, Math.min(92, p.gpu + rnd(-6, 6)))),
        step: p.step + Math.round(rnd(3, 9)),
      }));
      setHist((h) => {
        const last = h[h.length - 1];
        const v = last < 0.14 ? 0.62 : Math.max(0.1, last * rnd(0.93, 1.01));
        return [...h.slice(1), v];
      });
    }, 620);
    return () => clearInterval(t);
  }, [on]);

  return { lines, m, hist };
}

export function AgentTerminal({ className, note }: { className?: string; /** Shown in the title bar, e.g. the last scan's level. */ note?: ReactNode }) {
  const reduce = usePrefersReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const { lines, m, hist } = useTicker(visible && !reduce);

  const max = Math.max(...hist);
  const min = Math.min(...hist);
  const path = hist
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (hist.length - 1)) * 100).toFixed(1)} ${(2 + (1 - (v - min) / (max - min || 1)) * 16).toFixed(1)}`)
    .join(" ");

  return (
    <div ref={root} aria-hidden className={cn("term glass-strong overflow-hidden rounded-xl font-mono", className)}>
      {/* title bar */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2">
        <span className="size-[7px] rounded-full bg-[#ff6b6b]/70" />
        <span className="size-[7px] rounded-full bg-[#f5c451]/70" />
        <span className="size-[7px] rounded-full bg-ok/70" />
        <span className="ml-2 text-[9.5px] tracking-[0.08em] text-fg-subtle">agent@0% · review</span>
        {note && <span className="ml-auto text-[8.5px] uppercase tracking-[0.12em]">{note}</span>}
        <span className={cn("flex items-center gap-1 text-[8.5px] uppercase tracking-[0.14em] text-ok", note ? "ml-2" : "ml-auto")}>
          <span className="term-live size-1.5 rounded-full bg-ok" /> live
        </span>
      </div>

      {/* run log */}
      <div className="h-[9.6rem] space-y-[3px] overflow-hidden px-3 pt-2.5 text-[9px] leading-[1.45]">
        {lines.map((l) => (
          <div key={l.id} className="term-line flex gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
            <span className="hidden text-fg-subtle/60 xl:inline">{l.t}</span>
            {l.tone === "cmd" ? (
              <span className="text-fg">
                <span className="text-accent">$</span> {l.body}
              </span>
            ) : (
              <>
                <span className={cn("w-3 text-center", TONE[l.tone])}>{MARK[l.tone]}</span>
                <span className="w-[3.9rem] shrink-0 text-fg-muted">{l.tag}</span>
                <span className={l.tone === "warn" ? "text-violet" : l.tone === "run" ? "text-cyan" : "text-fg/85"}>{l.body}</span>
              </>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <span className="text-accent">❯</span>
          <span className="term-caret inline-block h-[1.05em] w-[0.55em] translate-y-[2px] bg-cyan/80" />
        </div>
      </div>

      {/* metrics */}
      <div className="grid grid-cols-[1fr_auto] gap-3 border-t border-white/[0.06] px-3 py-2.5">
        <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-[8.5px] uppercase tracking-[0.1em]">
          <Metric k="ppl" v={m.ppl.toFixed(1)} />
          <Metric k="burst" v={m.burst.toFixed(2)} />
          <Metric k="loss" v={`${m.loss.toFixed(3)} ↓`} tone="text-ok" />
          <Metric k="tok/s" v={`${m.tps.toFixed(1)}k`} />
          <Metric k="p95" v={`${m.lat} ms`} />
          <Metric k="step" v={m.step.toLocaleString("en-US")} />
        </div>
        <div className="flex w-[5.5rem] flex-col justify-between">
          <div className="flex items-center justify-between text-[8px] uppercase tracking-[0.12em] text-fg-subtle">
            <span>train loss</span>
          </div>
          <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-5 w-full">
            <path d={path} fill="none" stroke="rgb(95 216 245)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="mt-1 flex items-center gap-1.5 text-[8px] uppercase tracking-[0.12em] text-fg-subtle">
            gpu
            <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-cyan transition-[width] duration-500" style={{ width: `${m.gpu}%` }} />
            </span>
            <span className="text-fg-muted">{m.gpu}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-fg-subtle">{k}</div>
      <div className={cn("truncate text-[10px] normal-case tracking-normal text-fg", tone)}>{v}</div>
    </div>
  );
}
