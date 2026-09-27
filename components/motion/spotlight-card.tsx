import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Glass card that leans toward the cursor and catches its light. The tilt,
 * glare, lit edge and moving shadow all come from the shared pointer engine
 * (`data-tilt` + `.glass`); mark inner layers `data-pop` to lift them.
 * Pass `press` when the card is one big link, so the whole card sinks and
 * ripples when pressed.
 */
export function SpotlightCard({
  children,
  className,
  tilt = 9,
  press,
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
  press?: boolean;
}) {
  return (
    <div
      data-tilt={tilt}
      data-press={press || undefined}
      className={cn("glass group relative overflow-hidden rounded-2xl", className)}
    >
      <div className="relative h-full">{children}</div>
    </div>
  );
}
