import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NeuralMark } from "@/components/ui/neural-mark";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1320px] px-6 sm:px-10 lg:px-14", className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("studio-eyebrow font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-accent", className)}>
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("studio-section-heading max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && (
        <Eyebrow className={cn("mb-4 flex items-center gap-2.5", align === "center" && "justify-center")}>
          <NeuralMark />
          {eyebrow}
        </Eyebrow>
      )}
      <h2 className="text-balance text-3xl font-semibold tracking-tight text-fg sm:text-[40px] sm:leading-[1.1]">
        {title}
      </h2>
      {body && <p className="mt-4 text-pretty text-[15.5px] leading-relaxed text-fg-muted">{body}</p>}
    </div>
  );
}
