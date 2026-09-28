"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquareText } from "lucide-react";
import type { ScanFeedbackStatus } from "@/lib/local-model/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { localModel } from "@/config/app";
import { track } from "@/lib/analytics";

type State = ScanFeedbackStatus | { status: "waiting" };

// Feedback is handed over once, then deleted on the server. Kept here so a
// remount (React dev mode runs effects twice) doesn't lose it.
const received = new Map<string, string>();

/** Model output → points: "- ", "* ", "• " or "1." starts a point; other lines continue it. */
function toPoints(text: string): string[] {
  const lines = text.replace(/\*\*/g, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const marker = /^(?:[-*•]|\d+[.)])\s+/;
  if (!lines.some((l) => marker.test(l))) return lines;
  const points: string[] = [];
  for (const line of lines) {
    if (marker.test(line) || points.length === 0) points.push(line.replace(marker, ""));
    else points[points.length - 1] += ` ${line}`;
  }
  return points;
}

function usePolledFeedback(jobId: string): State {
  const [state, setState] = useState<State>(() => {
    const done = received.get(jobId);
    return done ? { status: "done", feedback: done } : { status: "waiting" };
  });

  useEffect(() => {
    if (received.has(jobId)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + localModel.scanFeedbackMinutes * 60_000;
    let misses = 0;

    const tick = async () => {
      let next: ScanFeedbackStatus | null = null;
      try {
        const res = await fetch(`/api/scan-feedback/${jobId}`, { cache: "no-store" });
        if (res.ok) next = (await res.json()) as ScanFeedbackStatus;
      } catch {
        // Offline for a moment; try again below.
      }
      if (next?.status === "done") received.set(jobId, next.feedback);
      if (stopped) return;
      if (next) {
        misses = 0;
        setState(next);
        if (next.status === "done") track("scan_feedback_shown");
        if (next.status !== "queued" && next.status !== "running") return;
      } else if (++misses >= 5) {
        setState({ status: "unavailable" });
        return;
      }
      if (Date.now() > deadline) {
        setState({ status: "unavailable" });
        return;
      }
      timer = setTimeout(tick, 2500);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  return state;
}

/**
 * Written feedback from the owner's local model, under a free scan. Appears
 * only when the scan queued a feedback job; the rest of the report never
 * waits on it.
 */
export function ModelFeedback({ jobId }: { jobId: string }) {
  const state = usePolledFeedback(jobId);

  if (state.status === "unavailable") {
    return (
      <p className="flex items-center gap-2 px-1 text-[12.5px] text-fg-subtle print:hidden">
        <MessageSquareText className="size-3.5 shrink-0" aria-hidden />
        Written feedback wasn&rsquo;t ready this time. The rest of your report is complete.
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
          Writing feedback
        </h2>
        <Badge tone="progress">Written by our language model</Badge>
      </div>

      {done ? (
        <motion.ul
          className="relative mt-4 space-y-2.5"
          initial="hidden"
          animate="shown"
          variants={{ shown: { transition: { staggerChildren: 0.08 } } }}
        >
          {toPoints(state.feedback).map((p, i) => (
            <motion.li
              key={i}
              variants={{ hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0 } }}
              className="flex gap-3 rounded-xl border border-[var(--line)] bg-ink-900/40 p-3.5 text-[13.5px] leading-relaxed text-fg-muted"
            >
              <span aria-hidden className="mt-0.5 font-mono text-[11px] text-[#c7b8ff]">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 whitespace-pre-wrap break-words">{p}</span>
            </motion.li>
          ))}
        </motion.ul>
      ) : (
        <div className="relative mt-4">
          <p className="flex items-center gap-2 text-[13px] text-fg-muted">
            {state.status === "running" ? "Our model is reading your text" : "Waiting for our writing model"}
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
        Suggestions on clarity and structure. They don&rsquo;t judge whether text is AI-written and aren&rsquo;t a Turnitin
        result. The feedback isn&rsquo;t saved.
      </p>
    </Card>
  );
}
