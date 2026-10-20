"use client";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { ReportBlock, Risk } from "@/lib/report-format";
import { cn } from "@/lib/utils";

export type RiskTone = "danger" | "warn" | "success" | "neutral";

/** Darker text for the printed PDF: the screen colours are light and would vanish on white paper. */
export const riskPrintClass: Record<RiskTone, string> = {
  danger: "print:border-[#1f4fc9] print:bg-transparent print:text-[#1f4fc9]",
  warn: "print:border-[#3b6fd6] print:bg-transparent print:text-[#3b6fd6]",
  success: "print:border-[#4a5266] print:bg-transparent print:text-[#4a5266]",
  neutral: "print:border-[#5d6478] print:bg-transparent print:text-[#3b4256]",
};

export const riskStyle: Record<Risk, { label: string; tone: RiskTone; rail: string }> = {
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
              <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#b4bccf] print:text-[#3a4258]">{b.title}</h3>
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
            <span aria-hidden className="mt-0.5 font-mono text-[11px] text-[#b4bccf] print:text-[#3a4258]">{String(numbers[i]).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1 space-y-1.5 break-words">
              {(b.location || risk) && (
                <div className="flex flex-wrap items-center gap-2">
                  {b.location && <span className="font-medium text-fg">{b.location}</span>}
                  {risk && <Badge tone={risk.tone} className={riskPrintClass[risk.tone]}>{risk.label}</Badge>}
                </div>
              )}
              {b.location || b.question || (b.notes && b.notes.length)
                ? b.notes?.map((note, j) => <p key={j}>{note}</p>)
                : <p className="whitespace-pre-wrap">{b.text}</p>}
              {b.question && (
                <p className="text-[13px] text-[#a9c1ff] print:text-[#2b3a8f]">
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
