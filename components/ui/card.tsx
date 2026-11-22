import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Glass card. Every card catches the cursor light; pass `tilt` (degrees, or
 * true for the default) to make it lean toward the cursor as well. Leave tilt
 * off for cards holding forms.
 */
export function Card({
  className,
  strong,
  tilt,
  ...props
}: HTMLAttributes<HTMLDivElement> & { strong?: boolean; tilt?: boolean | number }) {
  return (
    <div
      className={cn(strong ? "glass-strong" : "glass", "rounded-2xl", className)}
      data-tilt={tilt ? (tilt === true ? "" : String(tilt)) : undefined}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4 p-5 pb-0 sm:p-6 sm:pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[15px] font-semibold tracking-tight text-fg", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}
