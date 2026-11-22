import type { CSSProperties } from "react";
import { flowFor, statusMeta, stepIndex, type OrderStatus } from "@/lib/orders/status";
import type { ServiceType } from "@/config/pricing";
import { cn } from "@/lib/utils";

/**
 * An order's progress on one thin line: done steps are lit dots on a lit
 * line, the current one is a ring with a slow halo, the rest are hollow.
 * The lit part draws in when the page opens, so the eye lands on "now".
 */
export function OrderTimeline({ type, status }: { type: ServiceType; status: OrderStatus }) {
  const flow = flowFor(type);
  const current = stepIndex(type, status);
  if (status === "cancelled") {
    return <p className="text-[13px] text-risk">This order was cancelled.</p>;
  }
  const doneCount = status === "completed" ? flow.length : current;
  return (
    <ol
      className={cn("tl", flow.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-6")}
      aria-label="Order progress"
      style={{ "--tl-n": flow.length, "--tl-done": Math.max(0, Math.min(flow.length - 1, doneCount)) } as CSSProperties}
    >
      {flow.map((s, i) => {
        const done = i < current || status === "completed";
        const here = i === current && status !== "completed";
        return (
          <li key={s} className="tl-step" data-done={done || undefined} data-here={here || undefined} style={{ "--i": i } as CSSProperties}>
            <span className="tl-node" aria-current={here ? "step" : undefined}>
              <span className="sr-only">{done ? "Done: " : here ? "Now: " : ""}</span>
            </span>
            <span className="tl-label">
              <span className="nav-idx">{String(i + 1).padStart(2, "0")}</span>
              {statusMeta[s].label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
