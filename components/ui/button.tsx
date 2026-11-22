import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "btn-fx studio-button group/btn relative inline-flex select-none items-center justify-center gap-2.5 whitespace-nowrap rounded-full font-medium disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "min-h-9 px-4 text-[13px]",
    size === "md" && "min-h-11 px-5 text-sm",
    size === "lg" && "min-h-12 px-6 text-[15px]",
    "studio-btn-" + variant,
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
