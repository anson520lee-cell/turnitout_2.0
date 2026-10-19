"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WaitingAnimation } from "@/components/ui/waiting";

type Progress = { state: "running" | "done" | "failed"; reviewed: number; total: number; paused?: "daily_limit" };

/**
 * Keeps an automatic report moving while this page is open: asks the server to
 * review some more pieces, shows how far it got, and reloads the page when the
 * report is finished. Closing the page only pauses it; the saved pieces stay,
 * and the next visit carries on from there.
 */
export function AutoReportRunner({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [trouble, setTrouble] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let misses = 0;
    const loop = async () => {
      while (!stopped.current) {
        let wait = 1_000;
        try {
          const res = await fetch(`/api/reports/${orderId}/advance`, { method: "POST", cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const p = (await res.json()) as Progress;
          misses = 0;
          setTrouble(false);
          setProgress(p);
          if (p.state !== "running") {
            router.refresh();
            return;
          }
          if (p.paused) wait = 30_000;
        } catch {
          // A slow or dropped request is normal here; the server keeps what it has finished.
          misses += 1;
          setTrouble(true);
          wait = Math.min(15_000, 2_000 * misses);
        }
        await new Promise((r) => setTimeout(r, wait));
      }
    };
    void loop();
    return () => {
      stopped.current = true;
    };
  }, [orderId, router]);

  const reviewed = progress?.reviewed ?? 0;
  const total = progress?.total ?? 0;
  const pct = total ? Math.round((reviewed / total) * 100) : 0;
  return (
    <div>
      <WaitingAnimation
        title="Your report is being made"
        steps={[
          "Cutting your text into sections",
          "Reading each section sentence by sentence",
          "Rating every paragraph",
          "Putting the sections into one report",
        ]}
        stepMs={2600}
        note="This takes about a minute for a long text. You can close this page: your progress is saved, and the report carries on when you come back."
      />
      <div className="mx-auto mt-2 max-w-sm" aria-live="polite">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10 print:hidden">
          <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-center text-[12px] text-fg-subtle">
          {total ? `${reviewed} of ${total} sections done` : "Starting…"}
          {progress?.paused && " · busy right now, waiting a little"}
          {trouble && " · connection hiccup, retrying"}
        </p>
      </div>
    </div>
  );
}
