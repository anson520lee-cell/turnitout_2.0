import { Check } from "lucide-react";
import { flowFor, statusMeta, stepIndex, type OrderStatus } from "@/lib/orders/status";
import type { ServiceType } from "@/config/pricing";
import { cn } from "@/lib/utils";

export function OrderTimeline({ type, status }: { type: ServiceType; status: OrderStatus }) {
  const flow = flowFor(type);
  const current = stepIndex(type, status);
  if (status === "cancelled") {
    return <p className="text-[13px] text-risk">This order was cancelled.</p>;
  }
  return (
    <ol className="relative grid gap-0 sm:grid-cols-6" aria-label="Order progress">
      {flow.map((s, i) => {
        const done = i < current || status === "completed";
        const here = i === current && status !== "completed";
        return (
          <li key={s} className="relative flex gap-3 pb-5 sm:flex-col sm:items-center sm:pb-0 sm:text-center">
            {i < flow.length - 1 && (
              <span aria-hidden className={cn("absolute left-[11px] top-6 h-[calc(100%-12px)] w-px sm:left-[calc(50%+14px)] sm:top-[11px] sm:h-px sm:w-[calc(100%-28px)]", done ? "bg-accent" : "bg-[var(--line-strong)]")} />
            )}
            <span
              className={cn(
                "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border text-[11px]",
                done && "border-accent bg-accent text-white",
                here && "border-accent bg-ink-900 text-accent shadow-[0_0_0_4px_rgb(91_140_255/0.18)]",
                !done && !here && "border-[var(--line-strong)] bg-ink-900 text-fg-subtle",
              )}
              aria-current={here ? "step" : undefined}
            >
              {done ? <Check className="size-3.5" /> : here ? <span className="size-2 animate-pulse rounded-full bg-accent" /> : i + 1}
            </span>
            <span className={cn("text-[12.5px] sm:mt-2", here ? "font-medium text-fg" : done ? "text-fg-muted" : "text-fg-subtle")}>
              {statusMeta[s].label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
