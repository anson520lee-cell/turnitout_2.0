import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Container, Eyebrow } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";
import { HeroVisual } from "./hero-visual";
import { freeScan } from "@/config/app";

/** Extrusion layers behind the headline, nearest first. */
const DEPTH = [
  { i: 1, rgb: "78 118 255", a: 0.55 },
  { i: 2, rgb: "90 104 245", a: 0.38 },
  { i: 3, rgb: "108 96 235", a: 0.24 },
  { i: 4, rgb: "124 92 225", a: 0.13 },
];

function Headline() {
  const text = (sheen: boolean) => (
    <>
      <span className={sheen ? "depth-title-sheen" : undefined}>Know before</span>
      <br />
      you submit.
    </>
  );
  return (
    // The extruded copies sit beside the <h1>, not in it, so the heading's
    // text (what search engines and screen readers read) appears once.
    <div data-cursor className="depth-title relative mt-5 text-balance text-[42px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-6xl lg:text-[68px]">
      <span aria-hidden className="depth-title-layer depth-title-shadow">
        {text(false)}
      </span>
      {DEPTH.slice()
        .reverse()
        .map((l) => (
          <span
            key={l.i}
            aria-hidden
            className="depth-title-layer"
            style={{ ["--i" as string]: l.i, ["--layer-rgb" as string]: l.rgb, ["--layer-a" as string]: l.a }}
          >
            {text(false)}
          </span>
        ))}
      <h1 className="relative">{text(true)}</h1>
    </div>
  );
}

/** Aurora and a perspective floor that leans toward the cursor. Decorative. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div data-depth="-3" className="absolute inset-x-0 top-0 h-[760px]">
        <div className="aurora left-[48%] top-[-18%] size-[760px] bg-[radial-gradient(closest-side,rgb(91_140_255/0.2),rgb(91_140_255/0.06)_55%,transparent)] [--drift:17s]" />
        <div className="aurora left-[-12%] top-[-10%] size-[620px] bg-[radial-gradient(closest-side,rgb(154_123_255/0.15),transparent_70%)] [--drift:23s]" />
      </div>
      <div data-depth="-1" className="absolute inset-x-0 top-0 h-[760px]">
        <div className="aurora left-[62%] top-[30%] size-[420px] bg-[radial-gradient(closest-side,rgb(95_216_245/0.1),transparent_70%)] [--drift:14s]" />
      </div>
      <div data-cursor className="hero-floor absolute inset-x-0 bottom-0 h-[31%] min-h-[220px]">
        <div className="hero-floor-plane">
          <div className="hero-floor-grid" />
          <div className="hero-floor-light" />
        </div>
        {/* horizon */}
        <div className="absolute left-[34%] right-[6%] top-0 h-px bg-gradient-to-r from-transparent via-accent/35 to-transparent" />
        <div className="absolute left-[42%] right-[2%] -top-6 h-12 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(91_140_255/0.22),transparent)]" />
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="noise relative overflow-hidden pt-32 pb-20 sm:pt-40 lg:pb-28">
      <Backdrop />
      <Container className="relative grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-6">
        <div>
          <Reveal aboveFold>
            <Eyebrow>Academic writing screening</Eyebrow>
          </Reveal>
          <Reveal aboveFold delay={0.08} flip={24}>
            <Headline />
          </Reveal>
          <Reveal aboveFold delay={0.16}>
            <p className="mt-6 max-w-lg text-pretty text-[16.5px] leading-relaxed text-fg-muted">
              Run a preliminary writing scan instantly. When you need the real result, our team runs
              your text through Turnitin and sends you the AI and similarity report.
            </p>
          </Reveal>
          <Reveal aboveFold delay={0.24} className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/scan" className={buttonClasses("primary", "lg")}>
              Run free scan
              <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" />
            </Link>
            <Link href="/services/screening" className={buttonClasses("secondary", "lg")}>
              Get report
            </Link>
          </Reveal>
          <Reveal aboveFold delay={0.32}>
            <p className="mt-6 flex items-center gap-2 text-[13px] text-fg-subtle">
              <ShieldCheck className="size-4 text-ok" aria-hidden />
              {freeScan.dailyLimit} preliminary scans free every day. Private document handling.
            </p>
          </Reveal>
        </div>
        <Reveal aboveFold delay={0.2} className="flex justify-center lg:justify-end">
          <HeroVisual />
        </Reveal>
      </Container>
    </section>
  );
}
