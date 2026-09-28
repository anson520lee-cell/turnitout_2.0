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
    size === "sm" && "h-8 px-3 text-[13px]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-6 text-[15px]",
    variant === "primary" &&
      "btn-primary magnetic bg-gradient-to-b from-[#6c97ff] to-accent-strong text-white glow-accent hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_0_0_1px_rgb(120_165_255/0.6),0_18px_44px_-10px_rgb(91_140_255/0.85),0_0_28px_-4px_rgb(95_216_245/0.35),inset_0_1px_0_rgb(255_255_255/0.35)] active:translate-y-0 active:brightness-95 active:shadow-[0_0_0_1px_rgb(91_140_255/0.4),0_4px_14px_-6px_rgb(91_140_255/0.6),inset_0_2px_8px_rgb(0_0_0/0.3)]",
    variant === "secondary" &&
      "magnetic glass text-fg hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-white/[0.07] active:translate-y-0 active:bg-white/[0.04]",
    variant === "outline" &&
      "magnetic border border-[var(--line-strong)] bg-transparent text-fg hover:-translate-y-0.5 hover:border-accent/50 hover:bg-accent/[0.06] hover:shadow-[0_10px_30px_-12px_rgb(91_140_255/0.6)] active:translate-y-0",
    variant === "ghost" && "text-fg-muted hover:bg-white/[0.06] hover:text-fg active:bg-white/[0.09]",
    variant === "danger" &&
      "border border-risk/30 bg-risk/10 text-risk hover:-translate-y-0.5 hover:border-risk/50 hover:bg-risk/15 hover:shadow-[0_10px_30px_-12px_rgb(255_122_138/0.5)] active:translate-y-0",
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
