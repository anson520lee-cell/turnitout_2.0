import type { ReactNode } from "react";
import { Container, Eyebrow } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";

export function PageHeader({ eyebrow, title, body }: { eyebrow: string; title: ReactNode; body?: ReactNode }) {
  return (
    <section className="relative pt-36 pb-10 sm:pt-44">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(50%_60%_at_50%_0%,rgb(91_140_255/0.14),transparent_70%)]" />
      <Container className="relative">
        <Reveal aboveFold className="max-w-3xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">{title}</h1>
          {body && <p className="mt-5 max-w-2xl text-pretty text-[16px] leading-relaxed text-fg-muted">{body}</p>}
        </Reveal>
      </Container>
    </section>
  );
}
