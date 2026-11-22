"use client";
import { useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowUpRight, FileText } from "lucide-react";
import { sampleReport } from "@/lib/auto-report/sample";
import { sentenceAnchor } from "@/lib/auto-report/sentence-anchor";
import { Manuscript } from "./manuscript";
import { Card } from "@/components/ui/card";
import styles from "./sentence-study.module.css";

const sentences = sampleReport.paragraphs.flatMap((p) =>
  p.sentences.map((sentence) => ({
    ...sentence,
    paragraph: p.p,
    words: sentence.text.trim().split(/\s+/).length,
  })),
);
const maxWords = Math.max(...sentences.map((s) => s.words));
const heightAt = (words: number) => 88 - (words / maxWords) * 70;
const xAt = (i: number) => ((i + 0.5) / sentences.length) * 100;
const profile = sentences.map((s, i) => `${xAt(i)},${heightAt(s.words)}`).join(" ");

export function SentenceStudy() {
  const [index, setIndex] = useState(0);
  const id = useId();
  const held = useRef(false);
  const current = sentences[index];
  function inspect(event: PointerEvent<HTMLInputElement>) {
    if (event.pointerType !== "mouse" || event.buttons || held.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    setIndex(Math.max(0, Math.min(sentences.length - 1, Math.floor(fraction * sentences.length))));
  }
  return (
    <div className={styles.stage}>
      <Card strong className="noise relative overflow-hidden sm:mx-[2%]">
        <div
          aria-hidden
          className="absolute -right-16 -top-20 size-56 rounded-full bg-accent/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-10 size-56 rounded-full bg-chart-low/15 blur-3xl"
        />
        <div className="relative flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-2.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent">
            <FileText size={14} />
          </span>
          <span className="text-[12.5px] font-medium">AI-Writing Risk Report</span>
          <span className="ml-auto font-mono text-[10px] text-fg-subtle">Sample essay</span>
        </div>
        <Manuscript sentences={sentences} index={index} onInspect={setIndex} />
        <div className={styles.layout}>
          <div className="min-w-0">
            <label htmlFor={id} className={styles.chartLabel}>
              Words per sentence
            </label>
            <div
              className={styles.chart}
              style={{ "--count": sentences.length, "--selected": index } as CSSProperties}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className={styles.profile}
              >
                <polyline
                  points={profile}
                  fill="none"
                  stroke="var(--color-chart-mid)"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span aria-hidden="true" className={styles.bars}>
                {sentences.map((s) => (
                  <i key={s.n} data-risk={s.risk} style={{ height: `${100 - heightAt(s.words)}%` }} />
                ))}
              </span>
              <span aria-hidden="true" className={styles.marker}>
                <i />
              </span>
              <input
                id={id}
                type="range"
                min={1}
                max={sentences.length}
                step={1}
                value={index + 1}
                aria-describedby={`${id}-excerpt`}
                aria-valuetext={`Sentence ${current.n}, ${current.words} words, ${current.risk} risk`}
                onPointerMove={inspect}
                onPointerDown={() => {
                  held.current = true;
                }}
                onPointerLeave={() => {
                  held.current = false;
                }}
                onChange={(e) => setIndex(e.currentTarget.valueAsNumber - 1)}
              />
            </div>
          </div>
          <div className={styles.readout}>
            <p className={styles.meta}>
              P{current.paragraph} · Sentence {current.n} · {current.risk} risk
            </p>
            <blockquote id={`${id}-excerpt`}>{current.text}</blockquote>
            <p className={styles.note}>
              {current.why ?? (current.risk === "low" ? "The reviewer left this sentence unmarked." : "")}
            </p>
            <a
              className={styles.source}
              href={`/sample-report#${sentenceAnchor(current.paragraph, current.n)}`}
            >
              Read in context <ArrowUpRight size={12} aria-hidden />
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
