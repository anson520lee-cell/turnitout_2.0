import type { CSSProperties, ReactNode } from "react";
import { Container } from "@/components/ui/section";
import { Headline } from "@/components/ui/headline";
import { cn } from "@/lib/utils";

/**
 * Marketing page header, in the home page's voice: a centred two-line
 * headline, the second line drawn as a 1px outline, rising out of its slot
 * on load; a mono label between two hairlines above it; and a hairline under
 * the header that draws out from the centre (lines first).
 */
export function PageHeader({
  eyebrow,
  title,
  outline,
  body,
  align = "center",
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  /** Optional second line, drawn as an outline. */
  outline?: ReactNode;
  body?: ReactNode;
  align?: "left" | "center";
  children?: ReactNode;
}) {
  const center = align === "center";
  return (
    <section className={cn("page-head relative pt-32 pb-12 sm:pt-44 sm:pb-16", center && "text-center")}>
      <Container className="relative">
        <p className={cn("page-eyebrow", center && "page-eyebrow-center")}>
          <span>{eyebrow}</span>
        </p>
        <Headline as="h1" intro size="page" solid={title} outline={outline} align={align} className="mt-6" />
        {body && (
          <p
            data-reveal="intro"
            style={{ "--d": "0.28s" } as CSSProperties}
            className={cn("mt-7 max-w-2xl text-pretty text-[16px] leading-relaxed text-fg-muted", center && "mx-auto")}
          >
            {body}
          </p>
        )}
        {children}
      </Container>
    </section>
  );
}
