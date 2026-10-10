"use client";
import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { track } from "@/lib/analytics";
import { parseReport } from "@/lib/report-format";
import { ReportView } from "./report-view";

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
        <ReportView blocks={parseReport(state.feedback)} />      ) : (
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
