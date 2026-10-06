import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

/**
 * Button look for <button> and <Link>: capsules of liquid glass. `btn-fx`
 * gives every variant the shared press feedback (sink, spring back, ripple
 * from the press point; see the "Press and hover feedback" section of
 * globals.css), `btn-glass` the glass itself, and the primary button a rim of
 * light that runs around its edge on hover.
 */
export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "btn-fx group/btn relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "h-8 px-3.5 text-[13px]",
    size === "md" && "h-10 px-5 text-sm",
    size === "lg" && "h-12 px-7 text-[15px]",
    // Liquid glass: every filled variant is the same pane of glass, tinted (see .btn-glass in globals.css).
    variant === "primary" && "btn-primary btn-glass magnetic text-white [--tint:150_185_255] [--fill:0.07] [--edge-a:0.38]",
    variant === "secondary" && "btn-glass magnetic text-fg [--tint:205_218_255] [--fill:0.03]",
    variant === "outline" && "btn-glass magnetic text-fg [--tint:150_175_255] [--fill:0] [--edge-a:0.3]",
    variant === "ghost" && "text-fg-muted hover:bg-white/[0.07] hover:text-fg active:bg-white/[0.1]",
    variant === "danger" && "btn-glass text-[#ffd9de] [--tint:255_110_128] [--fill:0.1]",
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
