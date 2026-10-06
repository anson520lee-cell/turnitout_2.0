import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

/**
 * Button look for <button> and <Link>. `btn-fx` gives every variant the shared
 * press feedback (sink, spring back, ripple from the press point; see the
 * "Press and hover feedback" section of globals.css), and the primary button
 * a rim of light that runs around its edge on hover.
 */
export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "btn-fx group/btn relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "h-8 px-3 text-[13px] [--depth:3px]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-6 text-[15px] [--depth:6px]",
    variant === "primary" &&
      "btn-primary btn-3d magnetic bg-gradient-to-b from-[#80a6ff] via-[#5b8cff] to-accent-strong text-white [--edge:#213c93] [--glowc:91_140_255] hover:brightness-110 active:brightness-95",
    variant === "secondary" &&
      "btn-3d magnetic glass text-fg [--edge:#04060c] [--glowc:91_140_255] [--sheen:0.1] hover:border-[var(--line-strong)] hover:bg-white/[0.07] active:bg-white/[0.04]",
    variant === "outline" &&
      "btn-3d magnetic border border-[var(--line-strong)] bg-ink-900/60 text-fg [--edge:#101a3d] [--glowc:91_140_255] [--sheen:0.08] hover:border-accent/50 hover:bg-accent/[0.08]",
    variant === "ghost" && "text-fg-muted hover:bg-white/[0.06] hover:text-fg active:bg-white/[0.09]",
    variant === "danger" &&
      "btn-3d border border-risk/30 bg-[#2a1118] text-risk [--edge:#3d1119] [--glowc:255_122_138] [--sheen:0.08] hover:border-risk/50 hover:bg-[#33141d]",
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
