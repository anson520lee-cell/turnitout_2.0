"use client";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { ReportBlock, Risk } from "@/lib/report-format";
import { cn } from "@/lib/utils";

const riskStyle: Record<Risk, { label: string; tone: "danger" | "warn" | "success" | "neutral"; rail: string }> = {
  high: { label: "High", tone: "danger", rail: "bg-risk" },
  medium: { label: "Medium", tone: "warn", rail: "bg-warn" },
  low: { label: "Low", tone: "success", rail: "bg-ok" },
  uncertain: { label: "Uncertain", tone: "neutral", rail: "bg-fg-subtle" },
};

/** The report as sections and cards: location and risk on top, notes, then the question to ask yourself. */
export function ReportView({ blocks }: { blocks: ReportBlock[] }) {
  // Item numbers skip section headings: 01, 02 … across the whole report.
  const numbers = blocks.map((_, i) => blocks.slice(0, i + 1).filter((x) => x.kind === "item").length);
  return (
    <motion.div
      className="relative mt-4 space-y-2.5"
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: 0.05 } } }}
    >
      {blocks.map((b, i) => {
        const fade = { hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0 } };
        if (b.kind === "section") {
          return (
            <motion.div key={i} variants={fade} className={cn(i > 0 && "pt-3")}>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#c7b8ff]">{b.title}</h3>
              {b.text && <p className="mt-2 text-[13.5px] leading-relaxed text-fg">{b.text}</p>}
            </motion.div>
          );
        }
        const risk = b.risk ? riskStyle[b.risk] : null;
        return (
          <motion.div
            key={i}
            variants={fade}
            className="relative flex gap-3 overflow-hidden rounded-xl border border-[var(--line)] bg-ink-900/40 p-3.5 text-[13.5px] leading-relaxed text-fg-muted"
          >
            {risk && <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px] opacity-80", risk.rail)} />}
            <span aria-hidden className="mt-0.5 font-mono text-[11px] text-[#c7b8ff]">{String(numbers[i]).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1 space-y-1.5 break-words">
              {(b.location || risk) && (
                <div className="flex flex-wrap items-center gap-2">
                  {b.location && <span className="font-medium text-fg">{b.location}</span>}
                  {risk && <Badge tone={risk.tone}>{risk.label}</Badge>}
                </div>
              )}
              {b.location || b.question || (b.notes && b.notes.length)
                ? b.notes?.map((note, j) => <p key={j}>{note}</p>)
                : <p className="whitespace-pre-wrap">{b.text}</p>}
              {b.question && (
                <p className="text-[13px] text-[#a9c1ff]">
                  <span className="mr-1.5 font-mono text-[10.5px] uppercase tracking-wider text-fg-subtle">Ask yourself</span>
                  {b.question}
                </p>
              )}
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
