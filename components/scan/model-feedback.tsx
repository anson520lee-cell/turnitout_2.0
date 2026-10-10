"use client";
import { useCallback, useSyncExternalStore } from "react";
import { MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { track } from "@/lib/analytics";
import { overallRisk, parseReport } from "@/lib/report-format";
import { ReportView, riskPrintClass, riskStyle } from "./report-view";

type State =
  | { status: "waiting" }
  | { status: "streaming"; text: string }
  | { status: "done"; feedback: string }
  | { status: "unavailable"; reason?: string };

interface Store {
  state: State;
  started: boolean;
  subscribers: Set<() => void>;
}

// One request per scan. Kept here so a remount (React dev mode runs effects
// twice) neither asks twice nor loses what has already arrived.
const stores = new Map<string, Store>();

/**
 * Asks for the report and reads it as it is written: the server sends one JSON
 * object per line ({"t":"d","v":"text"}, then {"t":"done"} or {"t":"err"}).
 */
function getStore(ticket: string): Store {
  let store = stores.get(ticket);
  if (!store) {
    store = { state: { status: "waiting" }, started: false, subscribers: new Set() };
    stores.set(ticket, store);
    // Only the latest few scans are kept in memory.
    if (stores.size > 10) stores.delete(stores.keys().next().value as string);
  }
  return store;
}

function startRequest(store: Store, ticket: string, text: string) {
  if (store.started) return;
  store.started = true;
  const set = (next: State) => {
    store.state = next;
    store.subscribers.forEach((fn) => fn());
  };

  (async () => {
    let report = "";
    const finish = (reason: string) => {
      // Something was written before the problem: show it rather than nothing.
      if (report.trim()) set({ status: "done", feedback: report });
      else set({ status: "unavailable", reason });
    };
    try {
      const res = await fetch("/api/scan-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket, text }),
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { reason?: string } | null;
        return set({ status: "unavailable", reason: data?.reason ?? `http_${res.status}` });
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ended = false;
      while (!ended) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let msg: { t?: string; v?: string; reason?: string };
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.t === "d" && msg.v) {
            report += msg.v;
            set({ status: "streaming", text: report });
          } else if (msg.t === "done") {
            ended = true;
            set({ status: "done", feedback: report });
            track("scan_feedback_shown");
          } else if (msg.t === "err") {
            ended = true;
            finish(msg.reason ?? "error");
          }
        }
      }
      if (!ended) finish("closed");
    } catch {
      finish("network");
    }
  })();
}

const WAITING: State = { status: "waiting" };

function useFeedback(ticket: string, text: string): State {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const store = getStore(ticket);
      store.subscribers.add(onChange);
      startRequest(store, ticket, text);
      return () => {
        store.subscribers.delete(onChange);
      };
    },
    [ticket, text],
  );
  return useSyncExternalStore(
    subscribe,
    () => getStore(ticket).state,
    () => WAITING,
  );
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
  // While the report is still being written, show only the lines that are complete.
  const shown = state.status === "done" ? state.feedback : state.status === "streaming" ? state.text.slice(0, state.text.lastIndexOf("\n") + 1) : "";
  const blocks = parseReport(shown);
  const overall = overallRisk(blocks);
  const verdict = overall ? riskStyle[overall] : null;
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
        <div className="flex flex-wrap items-center gap-2">
          {verdict && <Badge tone={verdict.tone} className={riskPrintClass[verdict.tone]}>Review: {verdict.label} risk</Badge>}
          <Badge tone="progress" className="print:border-[#4b3a9a] print:bg-transparent print:text-[#4b3a9a]">Written by our language model</Badge>
        </div>
      </div>

      {blocks.length > 0 ? (
        <>
          <ReportView blocks={blocks} />
          {!done && (
            <p className="relative mt-3 flex items-center gap-2 text-[12.5px] text-fg-subtle">
              Still writing
              <span aria-hidden className="inline-flex gap-1">
                {[0, 160, 320].map((d) => (
                  <span key={d} className="waiting-dot size-1 rounded-full bg-violet" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
            </p>
          )}
        </>
      ) : (
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
        isn&rsquo;t a Turnitin result, and doesn&rsquo;t rewrite anything for you. The risk dial above is a quick statistical estimate; this review looks at sentence patterns in more detail, so the two can differ. It isn&rsquo;t saved.
      </p>
    </Card>
  );
}
