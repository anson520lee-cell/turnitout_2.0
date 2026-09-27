import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Glass card that leans toward the cursor and catches its light. The tilt,
 * glare, lit edge and moving shadow all come from the shared pointer engine
 * (`data-tilt` + `.glass`); mark inner layers `data-pop` to lift them.
 */
export function SpotlightCard({
  children,
  className,
  tilt = 9,
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
}) {
  return (
    <div
      data-tilt={tilt}
      className={cn("glass group relative overflow-hidden rounded-2xl", className)}
    >
      <div className="relative h-full">{children}</div>
    </div>
  );
}
