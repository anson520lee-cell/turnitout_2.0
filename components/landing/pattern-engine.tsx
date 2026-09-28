"use client";
import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenText, EyeOff, ListChecks, Server } from "lucide-react";
import { Container, Eyebrow } from "@/components/ui/section";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { buttonClasses } from "@/components/ui/button";
import { EngineCore, ENGINE_SIGNALS } from "./engine-core";
import { brand } from "@/config/app";

/**
 * Homepage promotion for the in-house analysis engine behind the free scan
 * (lib/scanning/heuristic-analyzer.ts). Every claim here describes what that
 * code does: deterministic text statistics, six signals, sentence-level
 * highlights, two readability measures, run on our server with no
 * third-party AI call, scanned text not stored. It makes no accuracy claim
 * and no claim about Turnitin.
 */

const SIGNAL_NOTES: Record<(typeof ENGINE_SIGNALS)[number], string> = {
  "Sentence variation": "How much sentence length varies across the text.",
  "Structural repetition": "How often sentences open the same way.",
  "Transition patterns": "Sentences that open with stock connectors like “Moreover”.",
  "Phrase uniformity": "Common set phrases and repeated three-word runs.",
  "Lexical diversity": "How varied the vocabulary is, per 100 words.",
  "Paragraph consistency": "Whether paragraphs are near-identical in length.",
};

const SPECS = [
  { value: "6", label: "writing signals" },
  { value: "2", label: "readability measures" },
  { value: "0", label: "third-party AI calls" },
];

const FACTS = [
  { icon: Server, title: "On our own server", body: "Results in seconds. Your text is never sent to a third-party AI API." },
  { icon: ListChecks, title: "Explainable", body: "Each signal shows what it measured, with sentence-level highlights." },
  { icon: BookOpenText, title: "Readability built in", body: "Flesch reading ease and Flesch–Kincaid grade on every scan." },
  { icon: EyeOff, title: "Not stored", body: "Scanned text is analysed in memory and not kept." },
];

export function PatternEngine() {
  const focus = useRef<number | null>(null);
  const rows = useRef<(HTMLElement | null)[]>([]);

  return (
    <section id="engine" aria-labelledby="engine-title" className="relative overflow-hidden py-24 sm:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div data-depth="-2" className="absolute right-[-10%] top-[8%] size-[720px] rounded-full bg-[radial-gradient(closest-side,rgb(91_140_255/0.12),transparent_70%)]" />
        <div data-depth="-1" className="absolute left-[-14%] bottom-[0%] size-[560px] rounded-full bg-[radial-gradient(closest-side,rgb(154_123_255/0.09),transparent_70%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--line-strong)] to-transparent" />
      </div>
      <Container className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.02fr] lg:gap-10">
          <div>
            <Reveal>
              <Eyebrow className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan shadow-[0_0_10px_#5fd8f5]" aria-hidden />
                Built in-house
              </Eyebrow>
            </Reveal>
            <Reveal delay={0.06}>
              <h2 id="engine-title" className="mt-4 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-[44px] sm:leading-[1.08]">
                Meet the <span data-cursor className="depth-title-sheen">{brand.name} Pattern Engine</span>.
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-5 max-w-xl text-pretty text-[15.5px] leading-relaxed text-fg-muted">
                Our free scan runs on our own analysis engine, built in-house. It reads how your writing is put
                together using deterministic, explainable text statistics, so the same text always gets the same
                reading, and every signal shows you what it measured and where.
              </p>
            </Reveal>
            <Reveal delay={0.16}>
              <dl className="mt-7 grid max-w-md grid-cols-3 gap-3">
                {SPECS.map((s) => (
                  <div key={s.label} className="rounded-2xl border border-[var(--line)] bg-ink-900/40 px-4 py-3">
                    <dt className="sr-only">{s.label}</dt>
                    <dd>
                      <span className="block text-[28px] font-semibold leading-none tracking-tight text-fg [text-shadow:0_0_24px_rgb(91_140_255/0.55)]">
                        {s.value}
                      </span>
                      <span className="mt-1.5 block text-[11.5px] leading-snug text-fg-subtle" aria-hidden>
                        {s.label}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
            <Stagger className="mt-7 grid gap-2 sm:grid-cols-2" gap={0.05}>
              {ENGINE_SIGNALS.map((name, i) => (
                <StaggerItem key={name}>
                  <div
                    ref={(el) => void (rows.current[i] = el)}
                    className="engine-signal h-full rounded-xl border px-3.5 py-3 transition-colors"
                    onPointerEnter={() => (focus.current = i)}
                    onPointerLeave={() => (focus.current = null)}
                  >
                    <p className="flex items-baseline gap-2 text-[13.5px] font-medium text-fg">
                      <span className="font-mono text-[10.5px] text-accent">0{i + 1}</span>
                      {name}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-snug text-fg-muted">{SIGNAL_NOTES[name]}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
            <Reveal delay={0.1} className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/scan" className={buttonClasses("primary", "lg")}>
                Try the engine free
                <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" />
              </Link>
              <Link href="/how-it-works" className={buttonClasses("ghost", "lg")}>
                How a scan works
              </Link>
            </Reveal>
          </div>
          <Reveal delay={0.1} flip={20}>
            <EngineCore focus={focus} listItems={rows} />
          </Reveal>
        </div>

        <Stagger className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f) => (
            <StaggerItem key={f.title} tilt={10} className="glass h-full rounded-2xl p-5">
              <span data-pop className="grid size-10 place-items-center rounded-xl border border-[var(--line)] bg-gradient-to-b from-white/[0.08] to-transparent">
                <f.icon className="size-[18px] text-accent" aria-hidden />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{f.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal>
          <p className="mt-8 max-w-3xl text-[12px] leading-relaxed text-fg-subtle">
            The Pattern Engine gives a preliminary estimate of patterns in your writing. It is not a Turnitin result,
            does not determine who wrote a text, and no score is a guarantee of any outcome.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
