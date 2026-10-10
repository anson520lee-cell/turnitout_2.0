import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Four hairline corner brackets, the "instrument panel" frame. Decorative; the parent must be positioned. */
export function HudCorners({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("hud-corners pointer-events-none absolute inset-2 z-[1]", className)}>
      <i /><i /><i /><i />
    </span>
  );
}

/** Small mono caption used as a panel label, with a live dot. */
export function HudLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("hud-label flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-subtle", className)}>
      <span aria-hidden className="hud-dot" />
      {children}
    </p>
  );
}

/** A lit inner tile: top highlight, soft glow on hover. */
export function Tile({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tile rounded-xl px-3 py-3", className)} {...props} />;
}

/** Segmented glowing meter (value 0–100). */
export function SegmentBar({ value, tone = "accent", segments = 24, delay = 0, className }: { value: number; tone?: "accent" | "ok" | "warn" | "risk"; segments?: number; delay?: number; className?: string }) {
  const lit = Math.round((Math.max(0, Math.min(100, value)) / 100) * segments);
  return (
    <div aria-hidden className={cn("segbar", className)} data-tone={tone} style={{ gridTemplateColumns: `repeat(${segments}, 1fr)` }}>
      {Array.from({ length: segments }).map((_, i) => (
        <i key={i} data-on={i < lit ? "" : undefined} style={{ animationDelay: `${delay + i * 28}ms` }} />
      ))}
    </div>
  );
}
