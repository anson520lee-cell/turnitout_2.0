"use client";

import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Brackets, Crosshair, ScanLine } from "lucide-react";
import { sampleReport } from "@/lib/auto-report/sample";
import { NavigationLink as Link } from "@/components/ui/navigation-link";

const modes = [
  { title: "Paragraph map", icon: ScanLine },
  { title: "Sentence signals", icon: Crosshair },
  { title: "Writing Refinement", icon: Brackets },
] as const;

const paragraphs = sampleReport.paragraphs;
const original = paragraphs[0].sentences[0];
const suggestion = "For years, the first question in urban transport was how to get people there faster.";

function Annotation({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="orb-annotation">
      <p className="orb-label">{title}</p>
      <div>{children}</div>
    </div>
  );
}

export function ReportExplorer() {
  const id = useId();
  const [mode, setMode] = useState(0);
  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [applied, setApplied] = useState(false);
  const paragraph = paragraphs[paragraphIndex];

  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    let next: number;
    switch (event.key) {
      case "ArrowLeft": next = (mode + modes.length - 1) % modes.length; break;
      case "ArrowRight": next = (mode + 1) % modes.length; break;
      case "Home": next = 0; break;
      case "End": next = modes.length - 1; break;
      default: return;
    }

    event.preventDefault();
    setMode(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  return (
    <div className="orb-explorer">
      <div className="orb-explorer-top">
        <span><span className="orb-indicator" /> Interactive sample</span>
        <span>Urban transport / excerpt</span>
      </div>
      <div className="orb-tabs" role="tablist" aria-label="Explore the sample report">
        {modes.map(({ title, icon: Icon }, index) => (
          <button
            key={title}
            type="button"
            id={`${id}-tab-${index}`}
            role="tab"
            aria-selected={mode === index}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={mode === index ? 0 : -1}
            onClick={() => setMode(index)}
            onKeyDown={moveTab}
          >
            <Icon size={16} aria-hidden="true" />
            {title}
          </button>
        ))}
      </div>

      {modes.map(({ title }, index) => (
        <div
          key={title}
          id={`${id}-panel-${index}`}
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={`${id}-tab-${index}`}
          className="orb-demo-panel"
          hidden={mode !== index}
        >
          {mode === index && (
            <div className="orb-demo-grid">
              {index === 0 && (
                <>
                  <div className="orb-demo-document">
                    <p className="orb-label">Paragraph {paragraph.p} / {paragraphs.length}</p>
                    <p className="orb-demo-quote" key={paragraph.p}>
                      {paragraph.sentences.map((sentence) => (
                        <span key={sentence.n}>
                          <span className={`orb-mark orb-mark-${sentence.risk}`}>{sentence.text}</span>{" "}
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="orb-demo-insight">
                    <p className="orb-label">Risk by paragraph</p>
                    <div className="orb-demo-bars" aria-label="Choose a paragraph">
                      {paragraphs.map((item, position) => {
                        const flagged = item.sentences.filter(({ risk }) => risk === "high" || risk === "medium").length;
                        const share = Math.round(flagged / item.sentences.length * 100);
                        return (
                          <button
                            key={item.p}
                            type="button"
                            aria-label={`Paragraph ${item.p}, ${share}% of sentences flagged`}
                            aria-pressed={paragraphIndex === position}
                            onClick={() => setParagraphIndex(position)}
                          >
                            <span className={`orb-bar-${item.risk}`} style={{ "--share": `${share}%` } as CSSProperties} />
                            <small>P{item.p}</small>
                          </button>
                        );
                      })}
                    </div>
                    <Annotation title={`${paragraph.risk} risk`}>
                      <p>{paragraph.note ?? "Select a paragraph to see its highlighted sentences in the draft."}</p>
                    </Annotation>
                  </div>
                </>
              )}
              {index === 1 && (
                <>
                  <div className="orb-demo-document">
                    <p className="orb-label">Sentence {original.n} / Paragraph 1</p>
                    <p className="orb-demo-quote"><mark className="orb-mark orb-mark-high">{original.text}</mark></p>
                  </div>
                  <div className="orb-demo-insight">
                    <Annotation title="Why it stands out"><p>{original.why}</p></Annotation>
                    <Annotation title="Ask yourself"><p>{original.ask}</p></Annotation>
                  </div>
                </>
              )}
              {index === 2 && (
                <>
                  <div className="orb-demo-document" aria-live="polite">
                    <p className="orb-label">{applied ? "Revised draft" : "Original draft"}</p>
                    <p className="orb-demo-quote">{applied ? suggestion : original.text}</p>
                  </div>
                  <div className="orb-demo-insight">
                    <Annotation title="Example suggestion"><p>{suggestion}</p></Annotation>
                    <button className="orb-demo-action" type="button" onClick={() => setApplied((current) => !current)}>
                      {applied ? "Undo suggestion" : "Try suggestion"} {applied ? <ArrowDown size={15} aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="orb-explorer-foot">
        <span>Illustrative text and ratings</span>
        <Link href="/sample-report">Full sample report <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </div>
    </div>
  );
}
