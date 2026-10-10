"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { track } from "@/lib/analytics";
import { parseReport, type ReportBlock, type Risk } from "@/lib/report-format";
import { cn } from "@/lib/utils";

type State = { status: "waiting" } | { status: "done"; feedback: string } | { status: "unavailable"; reason?: string };

// Feedback is requested once per scan. Kept here so a remount (React dev mode
// runs effects twice) neither asks twice nor loses it.
const requests = new Map<string, Promise<State>>();

function useFeedback(ticket: string, text: string): State {
  const [state, setState] = useState<State>({ status: "waiting" });

  useEffect(() => {
    let stopped = false;
    let request = requests.get(ticket);
    if (!request) {
      request = fetch("/api/scan-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket, text }),
        cache: "no-store",
      })
        .then(async (res): Promise<State> => {
          const data = (await res.json().catch(() => null)) as { feedback?: string; reason?: string } | null;
          if (res.ok && data?.feedback) return { status: "done", feedback: data.feedback };
          return { status: "unavailable", reason: data?.reason ?? `http_${res.status}` };
        })
        .catch((): State => ({ status: "unavailable" }));
      requests.set(ticket, request);
    }
    request.then((next) => {
      if (stopped) return;
      setState(next);
      if (next.status === "done") track("scan_feedback_shown");
    });
    return () => {
      stopped = true;
    };
  }, [ticket, text]);

  return state;
}

/**
 * Written feedback from DeepSeek, under a free scan. Appears only when
 * feedback is switched on; the rest of the report never waits on it.
 */
export function ModelFeedback({ ticket, text }: { ticket: string; text: string }) {
  const state = useFeedback(ticket, text);

  if (state.status === "unavailable") {
    return (
      <p className="flex items-center gap-2 px-1 text-[12.5px] text-fg-subtle print:hidden">
        <MessageSquareText className="size-3.5 shrink-0" aria-hidden />
        Written feedback wasn&rsquo;t ready this time. The rest of your report is complete.
        {state.reason ? <span className="font-mono text-[11px] opacity-70"> ({state.reason})</span> : null}
      </p>
    );
  }

  const done = state.status === "done";
  return (
    <Card className="relative overflow-hidden p-5 sm:p-6" aria-live="polite" aria-busy={!done}>
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-violet/15 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-violet/15 text-[#c7b8ff]">
            <MessageSquareText className="size-3.5" />
          </span>
          Self-check report
        </h2>
        <Badge tone="progress">Written by our language model</Badge>
      </div>

      {done ? (
        <Report blocks={parseReport(state.feedback)} />      ) : (
        <div className="relative mt-4">
          <p className="flex items-center gap-2 text-[13px] text-fg-muted">
            Our model is reading your text
            <span aria-hidden className="inline-flex gap-1">
              {[0, 160, 320].map((d) => (
                <span key={d} className="waiting-dot size-1 rounded-full bg-violet" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          </p>
          <div aria-hidden className="mt-4 space-y-2.5">
            {["w-[92%]", "w-[78%]", "w-[85%]"].map((w) => (
              <div key={w} className={`skeleton h-11 ${w}`} />
            ))}
          </div>
        </div>
      )}

      <p className="relative mt-4 border-t border-[var(--line)] pt-3 text-[12px] leading-relaxed text-fg-subtle">
        Places in your own writing that could be misread as AI-written, based on patterns from real Turnitin results. It doesn&rsquo;t decide who wrote the text,
        isn&rsquo;t a Turnitin result, and doesn&rsquo;t rewrite anything for you. It isn&rsquo;t saved.
      </p>
    </Card>
  );
}

const riskStyle: Record<Risk, { label: string; tone: "danger" | "warn" | "success" | "neutral"; rail: string }> = {
  high: { label: "High", tone: "danger", rail: "bg-risk" },
  medium: { label: "Medium", tone: "warn", rail: "bg-warn" },
  low: { label: "Low", tone: "success", rail: "bg-ok" },
  uncertain: { label: "Uncertain", tone: "neutral", rail: "bg-fg-subtle" },
};

/** The report as sections and cards: location and risk on top, notes, then the question to ask yourself. */
function Report({ blocks }: { blocks: ReportBlock[] }) {
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
