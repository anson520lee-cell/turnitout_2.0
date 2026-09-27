import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Container, Eyebrow } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";
import { HeroVisual } from "./hero-visual";
import { freeScan } from "@/config/app";

export function Hero() {
  return (
    <section className="noise relative overflow-hidden pt-32 pb-16 sm:pt-40 lg:pb-24">
      <div aria-hidden data-depth="-3" className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(60%_60%_at_70%_20%,rgb(91_140_255/0.14),transparent_70%),radial-gradient(40%_50%_at_10%_10%,rgb(154_123_255/0.1),transparent_70%)]" />
      <Container className="relative grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-6">
        <div>
          <Reveal>
            <Eyebrow>Academic writing screening</Eyebrow>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 data-depth="1" className="mt-5 text-balance text-[42px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-6xl lg:text-[68px]">
              <span className="text-gradient">Know before</span>
              <br />
              you submit.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-6 max-w-lg text-pretty text-[16.5px] leading-relaxed text-fg-muted">
              Run a preliminary writing scan instantly, then request a Turnitin-backed AI and similarity
              screening when you need a real report.
            </p>
          </Reveal>
          <Reveal delay={0.24} className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/scan" className={buttonClasses("primary", "lg")}>
              Run free scan
              <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" />
            </Link>
            <Link href="/services/screening" className={buttonClasses("secondary", "lg")}>
              Request screening
            </Link>
          </Reveal>
          <Reveal delay={0.32}>
            <p className="mt-6 flex items-center gap-2 text-[13px] text-fg-subtle">
              <ShieldCheck className="size-4 text-ok" aria-hidden />
              {freeScan.dailyLimit} preliminary scans free every day. Private document handling.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.2} className="flex justify-center lg:justify-end">
          <HeroVisual />
        </Reveal>
      </Container>
    </section>
  );
}
