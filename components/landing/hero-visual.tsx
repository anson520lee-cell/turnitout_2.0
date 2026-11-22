"use client";
import { useState } from "react";
import { ArrowRight, MoveHorizontal, Pause, Play } from "lucide-react";
import { OrbitCanvas } from "@/components/space/orbit-canvas";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";

const stages = [
  { form: "draft", name: "Draft", detail: "Start with your own text." },
  { form: "scan", name: "Scan", detail: "The reviewer reads each sentence in context." },
  { form: "report", name: "Report", detail: "Explore your paragraph map and marked sentences." },
] as const;

export function HeroVisual() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = usePrefersReducedMotion();
  const current = stages[index];
  const next = (index + 1) % stages.length;
  return (
    <figure className="orbit-viewer">
      <div className="orbit-stage">
        <OrbitCanvas
          form={current.form}
          paused={paused}
          onAdvance={() => setIndex(next)}
          label={`Show ${stages[next].name.toLowerCase()} stage`}
        />
        <span aria-hidden className="orbit-reticle" />
      </div>
      <figcaption>
        <div className="orbit-selector" role="group" aria-label="Report stages">
          {stages.map((stage, i) => (
            <button key={stage.form} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}>
              <i aria-hidden />
              {stage.name}
            </button>
          ))}
          {!reduce && (
            <button
              className="motion-key"
              type="button"
              onClick={() => setPaused(!paused)}
              aria-label={paused ? "Resume orbit animation" : "Pause orbit animation"}
              aria-pressed={paused}
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}
            </button>
          )}
        </div>
        <div className="orbit-caption">
          <span aria-live="polite">{current.detail}</span>
          <span className="orbit-gesture" aria-hidden>
            {reduce ? <ArrowRight size={13} /> : <MoveHorizontal size={14} />}
            {reduce ? "Select a stage" : "Drag to rotate"}
          </span>
        </div>
      </figcaption>
    </figure>
  );
}
