import Link from "next/link";
import { Container } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";

export function IntegritySection() {
  return (
    <section className="py-16">
      <Container>
        <Reveal tilt={3} className="glass relative overflow-hidden rounded-3xl p-8 sm:p-12">
          <div aria-hidden className="absolute -left-20 -bottom-20 size-72 rounded-full bg-violet/15 blur-3xl" />
          <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-violet">Academic integrity</p>
          <p className="relative mt-4 max-w-3xl text-balance text-xl leading-relaxed tracking-tight sm:text-2xl">
            We support students reviewing and refining work they have genuinely written. The service is not intended to
            disguise third-party or AI-generated work as original authorship.
          </p>
          <Link href="/academic-integrity" className="relative mt-6 inline-block text-[14px] text-accent underline-offset-4 hover:underline">
            Read our academic integrity policy
          </Link>
        </Reveal>
      </Container>
    </section>
  );
}
