"use client";
import { useEffect, useRef, useState } from "react";
import { Minus, X } from "lucide-react";
import { OVERALL_BANDS, bandFor, type LogLine, type LogTone } from "@/lib/auto-report/scan-script";
import type { Overall } from "@/lib/auto-report/stitch";
import { cn } from "@/lib/utils";

export interface TermLine extends LogLine {
  id: number;
  t: string;
}

const TONE: Record<LogTone, string> = {
  dim: "text-fg-subtle",
  ok: "text-ok",
  warn: "text-warn",
  risk: "text-risk",
  info: "text-[#a9c1ff]",
  violet: "text-violet",
};

export type TermId = "reader" | "reviewer" | "agents";
export const TERMS: { id: TermId; title: string; dot: string; hint: string }[] = [
  { id: "reader", title: "reader.log", dot: "bg-cyan", hint: "Reading your text, word by word" },
  { id: "reviewer", title: "reviewer.log", dot: "bg-violet", hint: "The reviewer's ratings and reasons, sentence by sentence" },
  { id: "agents", title: "agents.log", dot: "bg-accent", hint: "Scan agents cross-checking sentences" },
];

/** One terminal window: title bar with minimise/close, a log that keeps to the newest lines, and an optional live last line. */
export function Terminal({
  title,
  dot,
  lines,
  live,
  onClose,
  onMinimise,
  minimised,
  className,
  bodyClassName,
}: {
  title: string;
  dot: string;
  lines: TermLine[];
  live?: React.ReactNode;
  onClose?: () => void;
  onMinimise?: () => void;
  minimised?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, live]);
  return (
    <div className={cn("scan-term flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--line-strong)] bg-ink-950/85 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.9)]", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-white/[0.03] px-3 py-1.5">
        <span className={cn("size-2 rounded-full shadow-[0_0_8px_currentColor]", dot)} aria-hidden />
        <span className="font-mono text-[10.5px] tracking-[0.12em] text-fg-muted">{title}</span>
        <span className="scan-term-activity ml-1" aria-hidden />
        <span className="ml-auto flex items-center gap-1">
          {onMinimise && (
            <button type="button" onClick={onMinimise} className="grid size-5 place-items-center rounded text-fg-subtle hover:bg-white/10 hover:text-fg" aria-label={minimised ? `Expand ${title}` : `Minimise ${title}`}>
              <Minus className="size-3" />
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className="grid size-5 place-items-center rounded text-fg-subtle hover:bg-white/10 hover:text-fg" aria-label={`Close ${title}`}>
              <X className="size-3" />
            </button>
          )}
        </span>
      </div>
      {!minimised && (
        <div ref={body} className={cn("scan-term-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 font-mono text-[11px] leading-[1.55]", bodyClassName)}>
          {lines.map((l, i) => (
            <p key={l.id} className={cn("break-words", TONE[l.tone], i === lines.length - 1 && !live && "scan-type")}>
              <span className="mr-2 text-fg-subtle/50">{l.t}</span>
              {l.text}
            </p>
          ))}
          {live}
        </div>
      )}
    </div>
  );
}

const bandText: Record<Overall, { label: string; cls: string; bar: string }> = {
  low: { label: "Low", cls: "text-ok border-ok/40 bg-ok/10", bar: "from-ok/70 to-ok" },
  moderate: { label: "Moderate", cls: "text-warn border-warn/40 bg-warn/10", bar: "from-warn/60 to-warn" },
  elevated: { label: "Elevated", cls: "text-risk border-risk/40 bg-risk/10", bar: "from-risk/60 to-risk" },
};

/**
 * The live AI rate: the share of sentences flagged so far, climbing as the
 * reviewer's ratings are replayed, ending on the report's own figure. Before
 * the reviewer has answered it shows that it is still waiting, not a number.
 */
export function RatePanel({
  rate,
  ready,
  final,
  scanned,
  total,
  high,
  medium,
  uncertain,
  history,
  compact,
}: {
  rate: number;
  ready: boolean;
  final: boolean;
  scanned: number;
  total: number;
  high: number;
  medium: number;
  uncertain: number;
  history: number[];
  compact?: boolean;
}) {
  const shown = useTween(rate, final);
  const band = bandFor(rate);
  const pct = shown * 100;
  const big = final ? `${Math.round(rate * 100)}` : pct.toFixed(1);
  const progress = total ? scanned / total : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-fg-subtle">AI rate</p>
          <p className={cn("scan-rate-num font-mono text-[26px] font-semibold leading-none tabular-nums", ready ? "text-fg" : "text-fg-subtle")}>
            {ready ? big : "--.-"}
            <span className="text-[14px] text-fg-subtle">%</span>
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-300", bandText[band].bar)} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="mt-1 truncate font-mono text-[10px] text-fg-subtle">
            {scanned}/{total} sentences · <span className="text-risk">{high} high</span> · <span className="text-warn">{medium} med</span>
          </p>
        </div>
        {ready && <span className={cn("shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase", bandText[band].cls)}>{bandText[band].label}</span>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-subtle">
          <span className="scan-live-dot" aria-hidden /> AI rate
        </p>
        <p className={cn("scan-rate-num mt-2 font-mono text-[52px] font-semibold leading-none tracking-tight tabular-nums", ready ? "text-fg" : "text-fg-subtle", final && "scan-rate-land")}>
          {ready ? big : "--.-"}
          <span className="ml-0.5 text-[22px] text-fg-subtle">%</span>
        </p>
        <p className="mt-1.5 text-[11.5px] leading-snug text-fg-subtle">{ready ? "of sentences flagged so far" : "waiting for the reviewer's first ratings"}</p>
        {ready && <span className={cn("mt-3 inline-block rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider", bandText[band].cls)}>{bandText[band].label}</span>}
      </div>

      <div className="relative flex min-h-[120px] flex-1 gap-3">
        <div className="relative w-3 overflow-hidden rounded-full bg-white/[0.06]">
          <div className={cn("absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t transition-[height] duration-300", bandText[band].bar)} style={{ height: `${Math.min(100, pct)}%` }} />
          {[OVERALL_BANDS.moderate, OVERALL_BANDS.elevated].map((b) => (
            <span key={b} className="absolute inset-x-0 h-px bg-white/40" style={{ bottom: `${b * 100}%` }} />
          ))}
        </div>
        <div className="relative flex-1 font-mono text-[9.5px] text-fg-subtle">
          <span className="absolute left-0" style={{ bottom: `calc(${OVERALL_BANDS.elevated * 100}% - 6px)` }}>{OVERALL_BANDS.elevated * 100}% elevated</span>
          <span className="absolute left-0" style={{ bottom: `calc(${OVERALL_BANDS.moderate * 100}% - 6px)` }}>{OVERALL_BANDS.moderate * 100}% moderate</span>
          <Spark values={history} className="absolute inset-x-0 bottom-0 h-1/3" />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 font-mono text-[11px]">
        <Cell k="Scanned" v={`${scanned}/${total}`} />
        <Cell k="Progress" v={`${Math.round(progress * 100)}%`} />
        <Cell k="High" v={String(high)} tone="text-risk" />
        <Cell k="Medium" v={String(medium)} tone="text-warn" />
        <Cell k="Uncertain" v={String(uncertain)} tone="text-violet" />
        <Cell k="Clear" v={String(Math.max(0, scanned - high - medium - uncertain))} tone="text-ok" />
      </dl>
    </div>
  );
}

function Cell({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white/[0.02] px-2.5 py-1.5">
      <dt className="text-[9.5px] uppercase tracking-[0.16em] text-fg-subtle">{k}</dt>
      <dd className={cn("mt-0.5 text-[14px] tabular-nums text-fg", tone)}>{v}</dd>
    </div>
  );
}

function Spark({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(0.05, ...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${100 - (v / max) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden>
      <polyline points={pts} fill="none" stroke="rgb(95 216 245 / 0.8)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Eases the shown number toward the real one, so it is always moving while it climbs. */
function useTween(target: number, snap: boolean) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (snap) return;
    let raf = 0;
    const step = () => {
      const d = target - cur.current;
      cur.current = Math.abs(d) < 0.0004 ? target : cur.current + d * 0.12;
      setV(cur.current);
      if (cur.current !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, snap]);
  return snap ? target : v;
}
