"use client";
import { useEffect, useState } from "react";
import type { AutoReportResult } from "@/lib/auto-report/stitch";

export interface ReportFeed {
  state: "running" | "done" | "failed";
  /** Sections the reviewer has returned, of all sections. */
  reviewed: number;
  total: number;
  paused: boolean;
  /** The last request failed; it is being retried. */
  trouble: boolean;
  /** The finished report, once there is one. */
  result: AutoReportResult | null;
}

type Progress = { state: ReportFeed["state"]; reviewed: number; total: number; paused?: "daily_limit"; result?: AutoReportResult | null };

const START: ReportFeed = { state: "running", reviewed: 0, total: 0, paused: false, trouble: false, result: null };

/**
 * Keeps an automatic report moving while the page is open: asks the server to
 * review some more pieces and reports how far it got, until the report is done
 * (with the finished report) or has failed. While the tab is hidden the
 * background runner can pick up the saved progress.
 */
export function useLiveReportFeed(orderId: string | null): ReportFeed {
  const [feed, setFeed] = useState<ReportFeed>(START);
  useEffect(() => {
    if (!orderId) return;
    let stopped = false;
    let finished = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let misses = 0;

    const advance = async () => {
      if (stopped || finished || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      let wait = 1_000;
      try {
        const res = await fetch(`/api/reports/${orderId}/advance`, { method: "POST", cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const p = (await res.json()) as Progress;
        if (stopped) return;
        misses = 0;
        finished = p.state !== "running";
        setFeed({ state: p.state, reviewed: p.reviewed, total: p.total, paused: Boolean(p.paused), trouble: false, result: p.result ?? null });
        if (p.paused) wait = 30_000;
      } catch {
        if (stopped) return;
        // The server keeps what it has finished, so a retry can continue.
        misses += 1;
        setFeed((f) => ({ ...f, trouble: true }));
        wait = Math.min(15_000, 2_000 * misses);
      } finally {
        inFlight = false;
        if (!stopped && !finished && document.visibilityState === "visible") {
          timer = setTimeout(advance, wait);
        }
      }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      void advance();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void advance();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [orderId]);

  return feed;
}

/** A stand-in feed for the design preview: the given report "arrives" after a delay, section by section. */
export function useDemoReportFeed(result: AutoReportResult | null, readyAfterMs: number): ReportFeed {
  const total = result?.pieces.total ?? 1;
  const [feed, setFeed] = useState<ReportFeed>({ ...START, total });
  useEffect(() => {
    if (!result) return;
    const timers = Array.from({ length: total }, (_, i) =>
      setTimeout(() => {
        const last = i === total - 1;
        setFeed({ state: last ? "done" : "running", reviewed: i + 1, total, paused: false, trouble: false, result: last ? result : null });
      }, (readyAfterMs * (i + 1)) / total),
    );
    return () => timers.forEach(clearTimeout);
  }, [result, readyAfterMs, total]);
  return feed;
}
