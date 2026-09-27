import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "progress" | "success" | "danger" | "warn" | "accent";

const tones: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/[0.04] text-fg-muted",
  info: "border-accent/25 bg-accent/10 text-[#a9c1ff]",
  progress: "border-violet/30 bg-violet/10 text-[#c7b8ff]",
  success: "border-ok/25 bg-ok/10 text-ok",
  danger: "border-risk/25 bg-risk/10 text-risk",
  warn: "border-warn/25 bg-warn/10 text-warn",
  accent: "border-cyan/25 bg-cyan/10 text-cyan",
};

export function Badge({
  tone = "neutral",
  className,
  dot,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {props.children}
    </span>
  );
}
