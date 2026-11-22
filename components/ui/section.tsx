import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";
import { Headline } from "@/components/ui/headline";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-accent", className)}>
      {children}
    </p>
  );
}

/**
 * Section title in the home page's voice: a mono label after a short
 * hairline that draws in, then the headline (an optional second line drawn
 * as a 1px outline), each line rising with the scroll, then the body copy.
 */
export function SectionHeading({
  eyebrow,
  title,
  outline,
  body,
  align = "left",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Optional second line, drawn as an outline. */
  outline?: ReactNode;
  body?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  const center = align === "center";
  return (
    <div className={cn("max-w-3xl", center && "mx-auto text-center", className)}>
      {eyebrow && (
        <Reveal className={cn("section-eyebrow", center && "section-eyebrow-center")}>
          <span>{eyebrow}</span>
        </Reveal>
      )}
      <Headline solid={title} outline={outline} align={align} className={eyebrow ? "mt-5" : undefined} />
      {body && (
        <Reveal className={cn("mt-6 max-w-2xl text-pretty text-[15.5px] leading-relaxed text-fg-muted", center && "mx-auto")}>
          {body}
        </Reveal>
      )}
    </div>
  );
}
