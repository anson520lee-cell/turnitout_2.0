"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Container, SectionHeading } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FeatureSpace } from "@/components/ml/feature-space";

/**
 * Interactive illustration of how the preliminary scan reads a paragraph.
 * Uses two fixed example paragraphs; clearly labelled as an example.
 */
const samples = {
  formulaic: {
    label: "Formulaic draft",
    text: [
      { t: "Moreover, ", k: "transition" },
      { t: "technology plays a crucial role in modern education. ", k: "phrase" },
      { t: "Furthermore, ", k: "transition" },
      { t: "it offers students a wide range of tools. ", k: "phrase" },
      { t: "Additionally, ", k: "transition" },
      { t: "it helps teachers save time on grading. ", k: null },
      { t: "In today’s fast-paced world, ", k: "phrase" },
      { t: "online platforms have become increasingly important. ", k: null },
      { t: "Moreover, ", k: "transition" },
      { t: "they provide a wealth of information at the click of a button. ", k: "phrase" },
      { t: "Furthermore, ", k: "transition" },
      { t: "students can learn at their own pace. ", k: null },
      { t: "Additionally, ", k: "transition" },
      { t: "teachers can track progress more easily. ", k: null },
      { t: "It is important to note that ", k: "phrase" },
      { t: "digital tools also help students collaborate with their peers. ", k: null },
      { t: "Moreover, ", k: "transition" },
      { t: "they make learning more engaging and interactive. ", k: "phrase" },
      { t: "Furthermore, ", k: "transition" },
      { t: "access to quality education is no longer limited by location. ", k: null },
      { t: "However, ", k: "transition" },
      { t: "it is worth noting that challenges remain. ", k: "phrase" },
      { t: "Moreover, ", k: "transition" },
      { t: "not every student has equal access to technology. ", k: null },
      { t: "Furthermore, ", k: "transition" },
      { t: "educators must navigate a rapidly evolving digital landscape. ", k: "phrase" },
      { t: "In conclusion, it is clear that ", k: "phrase" },
      { t: "technology plays a vital role in shaping the future of learning.", k: "phrase" },
    ],
    bars: { "Sentence Variation": 82, "Transition Patterns": 90, "Phrase Uniformity": 70, "Lexical Diversity": 38 },
    level: "Elevated" as const,
  },
  natural: {
    label: "Revised draft",
    text: [
      { t: "The survey went badly. ", k: null },
      { t: "Only 41 of 400 students replied, far below the rate reported by Chan et al. (2019), ", k: null },
      { t: "and the timing explains most of it: ", k: null },
      { t: "we sent it the night before a statistics midterm. ", k: null },
      { t: "A second round in week nine did better. ", k: null },
      { t: "We moved it to a Tuesday morning, cut the questions from 32 to 14, and asked tutors to share the link in class. ", k: null },
      { t: "That brought 163 replies. ", k: null },
      { t: "The extra answers changed one finding: ", k: null },
      { t: "first-years, not finalists, were the group least likely to use the library after six. ", k: null },
      { t: "We had expected the opposite. ", k: null },
      { t: "Finalists, after all, were the ones writing dissertations, and the library’s own door counts showed them there until closing. ", k: null },
      { t: "But the door counts could not say who was coming in at seven, and the survey could. ", k: null },
      { t: "Ten of the first-years we followed up with mentioned the same thing, a shuttle bus that stops running at 6.15. ", k: null },
      { t: "It also shaped our one recommendation: before extending opening hours, ask whether the students who most need them can get home.", k: null },
    ],
    bars: { "Sentence Variation": 12, "Transition Patterns": 8, "Phrase Uniformity": 10, "Lexical Diversity": 15 },
    level: "Low" as const,
  },
};

type Key = keyof typeof samples;

export function AnalysisPreview() {
  const [key, setKey] = useState<Key>("formulaic");
  const s = samples[key];
  return (
    <section className="relative py-24 sm:py-32">
      <div aria-hidden className="absolute inset-x-0 top-1/2 -z-10 h-[480px] -translate-y-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(91_140_255/0.08),transparent)]" />
      <Container>
        <SectionHeading
          eyebrow="Preliminary analysis"
          title="Writing analysis without the guesswork."
          body="The free scan measures concrete properties of your text and explains each one. It doesn't return a made-up AI percentage."
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Card strong tilt={4} className="flex flex-col p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="Example text" className="inline-flex rounded-xl border border-[var(--line)] bg-ink-900/60 p-1">
                {(Object.keys(samples) as Key[]).map((k) => (
                  <button
                    key={k}
                    role="tab"
                    data-press
                    aria-selected={k === key}
                    onClick={() => setKey(k)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-[13px] transition",
                      k === key ? "bg-white/[0.08] text-fg" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {samples[k].label}
                  </button>
                ))}
              </div>
              <Badge>Example</Badge>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
                className="mt-6 flex-1 font-serif text-[17px] leading-[1.85] text-fg/90"
              >
                {s.text.map((seg, i) => (
                  <span
                    key={i}
                    className={cn(
                      seg.k === "transition" && "rounded bg-violet/15 px-0.5 text-[#d6cbff] underline decoration-violet/60 decoration-2 underline-offset-4",
                      seg.k === "phrase" && "rounded bg-accent/10 underline decoration-accent/50 decoration-dotted decoration-2 underline-offset-4",
                    )}
                  >
                    {seg.t}
                  </span>
                ))}
              </motion.p>
            </AnimatePresence>
            <div className="mt-6 flex flex-wrap gap-4 text-[12px] text-fg-subtle">
              <span className="flex items-center gap-2"><span className="h-2 w-4 rounded-sm bg-violet/40" />Repeated connector</span>
              <span className="flex items-center gap-2"><span className="h-2 w-4 rounded-sm bg-accent/30" />Stock phrasing</span>
            </div>
          </Card>
          <Card tilt={4} className="p-6 sm:p-7">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-fg-muted">Preliminary risk estimate</p>
              <Badge tone={s.level === "Elevated" ? "danger" : "success"} dot>
                {s.level}
              </Badge>
            </div>
            {/* where this example sits among other texts: it crosses the boundary when the example changes */}
            <div aria-hidden className="mt-5 overflow-hidden rounded-xl border border-[var(--line)] bg-ink-900/50">
              <FeatureSpace elevated={s.level === "Elevated"} className="block h-auto w-full" />
              <p className="border-t border-[var(--line)] px-3 py-1.5 text-center font-mono text-[9.5px] uppercase tracking-[0.16em] text-fg-subtle">feature space · nearest neighbours</p>
            </div>
            <ul className="mt-6 space-y-5">
              {Object.entries(s.bars).map(([label, v]) => (
                <li key={label}>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-fg">{label}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-cyan via-accent to-violet"
                      initial={false}
                      animate={{ width: `${v}%` }}
                      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-[var(--line)] pt-4 text-[12px] leading-relaxed text-fg-subtle">
              Illustration only. A preliminary scan describes patterns in the text. It does not determine authorship and is not a Turnitin result.
            </p>
          </Card>
        </div>
      </Container>
    </section>
  );
}
