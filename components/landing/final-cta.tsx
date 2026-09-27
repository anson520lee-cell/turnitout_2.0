import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";
import { buttonClasses } from "@/components/ui/button";
import { CssDocument } from "./css-document";
import { freeScan } from "@/config/app";

export function FinalCta() {
  return (
    <section className="py-24">
      <Container>
        <Reveal className="glass-strong noise relative overflow-hidden rounded-[28px] px-7 py-14 sm:px-14 sm:py-20">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_85%_50%,rgb(91_140_255/0.22),transparent_70%)]" />
          <div aria-hidden className="absolute -right-10 top-1/2 hidden h-[130%] w-[42%] -translate-y-1/2 opacity-80 lg:block">
            <CssDocument />
          </div>
          <div className="relative max-w-xl">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">Know before you submit.</h2>
            <p className="mt-4 text-[16px] text-fg-muted">
              Start with a free preliminary scan. Request a real screening when you need verification.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className={buttonClasses("primary", "lg")}>
                Run free scan <ArrowRight className="size-4" />
              </Link>
              <Link href="/pricing" className={buttonClasses("secondary", "lg")}>
                See pricing
              </Link>
            </div>
            <p className="mt-5 text-[12.5px] text-fg-subtle">{freeScan.dailyLimit} preliminary scans free every day.</p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
