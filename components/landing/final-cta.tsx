import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";
import { buttonClasses } from "@/components/ui/button";
import { CssDocument } from "./css-document";
import { NeuralHalo } from "@/components/ml/ml-visuals";
import { freeScan } from "@/config/app";

export function FinalCta() {
  return (
    <section className="py-24">
      <Container>
        <Reveal tilt={2.5} flip={18} className="glass-strong noise relative overflow-hidden rounded-[28px] px-7 py-14 sm:px-14 sm:py-20">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_85%_50%,rgb(91_140_255/0.22),transparent_70%)]" />
          <div aria-hidden data-depth="-2" className="absolute right-[18%] top-1/2 hidden size-[340px] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(95_216_245/0.16),transparent_70%)] lg:block" />
          <div aria-hidden data-depth="-1" className="absolute right-[2%] top-1/2 hidden size-[500px] -translate-y-1/2 opacity-70 lg:block">
            <NeuralHalo className="engine-spin-rev [--spin:110s]" />
          </div>
          <div aria-hidden className="absolute -right-10 top-1/2 hidden h-[130%] w-[42%] -translate-y-1/2 opacity-80 lg:block" data-depth="2">
            <CssDocument />
          </div>
          <div className="relative max-w-xl">
            <h2 data-cursor className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
              Know before <span className="depth-title-sheen">you submit.</span>
            </h2>
            <p className="mt-4 text-[16px] text-fg-muted">
              Start with a free preliminary scan. Get a report when you need the actual result.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/scan" className={buttonClasses("primary", "lg")}>
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
