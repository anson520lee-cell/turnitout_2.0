import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "group/btn relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "h-8 px-3 text-[13px]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-6 text-[15px]",
    variant === "primary" &&
      "magnetic bg-gradient-to-b from-[#6c97ff] to-accent-strong text-white glow-accent hover:-translate-y-px hover:brightness-110 hover:shadow-[0_0_0_1px_rgb(91_140_255/0.5),0_14px_40px_-8px_rgb(91_140_255/0.75),inset_0_1px_0_rgb(255_255_255/0.3)] active:translate-y-0 active:shadow-[0_0_0_1px_rgb(91_140_255/0.4),0_4px_14px_-6px_rgb(91_140_255/0.6),inset_0_2px_6px_rgb(0_0_0/0.25)]",
    variant === "secondary" &&
      "magnetic glass text-fg hover:-translate-y-px hover:border-[var(--line-strong)] hover:bg-white/[0.06] active:translate-y-0",
    variant === "outline" &&
      "border border-[var(--line-strong)] bg-transparent text-fg hover:bg-white/[0.04]",
    variant === "ghost" && "text-fg-muted hover:bg-white/[0.05] hover:text-fg",
    variant === "danger" &&
      "border border-risk/30 bg-risk/10 text-risk hover:bg-risk/15",
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
    </button>
  );
});
