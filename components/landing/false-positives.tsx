"use client";
import { Container, SectionHeading } from "@/components/ui/section";
import { useState } from "react";
import { ArrowDownRight } from "lucide-react";
import styles from "./writing-atlas.module.css";

const reasons = [
  {
    title: "Formal academic register",
    phrase: "It is therefore necessary to consider", rest: " how the sample was selected.",
    body: "Academic conventions reward consistent structure and signposting, which is also what detectors look for.",
  },
  {
    title: "Second-language writing",
    phrase: "The results show that", rest: " both groups improved after practice.",
    body: "Writers working in a second language often favour safer, more predictable phrasing and a narrower vocabulary.",
  },
  {
    title: "Templates and rubrics",
    phrase: "The purpose of this experiment was to", rest: " measure how quickly the water cooled.",
    body: "Following a required structure paragraph by paragraph produces the even, repeated shape detectors weigh.",
  },
  {
    title: "Heavy editing tools",
    phrase: "These findings provide valuable insight", rest: " into how students divide their time.",
    body: "Grammar and style tools can smooth out the natural variation in a draft.",
  },
];

export function FalsePositives() {
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const index = hovered ?? selected;
  const item = reasons[index];
  return (
    <section className="py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <SectionHeading
          eyebrow="False positives"
          title="Why genuine writing can still be flagged."
          body="Automated AI-writing indicators measure how predictable a text is. Plenty of honest writing is predictable. An indicator is a signal to read carefully, not proof of who wrote something."
        />
        <div className={styles.archive} onPointerLeave={() => setHovered(null)}>
          <div className={styles.sample} id="example-reading">
            <div key={index} className={styles.sampleContent}>
              <p className={styles.noteMeta}>Illustrative sentence · {String(index + 1).padStart(2, "0")} / 04</p>
              <blockquote className={styles.quote}>“<mark>{item.phrase}</mark>{item.rest}”</blockquote>
              <p className={styles.explanation}>{item.body}</p>
            </div>
          </div>
          <div onBlur={() => setHovered(null)}>
            {reasons.map((reason, i) => (
              <button type="button" key={reason.title} className={styles.row}
                aria-pressed={selected === i} data-active={index === i} aria-controls="example-reading"
                onPointerMove={event => { if (event.pointerType === "mouse") setHovered(i); }}
                onFocus={() => setHovered(i)}
                onClick={() => { setSelected(i); setHovered(null); }}>
                <span className={styles.number}>{String(i + 1).padStart(2, "0")}</span>
                <span>{reason.title}</span><ArrowDownRight size={16} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
