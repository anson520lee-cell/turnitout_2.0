"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Rotate3d } from "lucide-react";

const views = ["paragraph", "sentence", "refinement"] as const;

export function OrbitalStudy() {
  const [angle, setAngle] = useState(0);
  function rotate(direction: number) {
    setAngle((previous) => (previous + direction + views.length) % views.length);
  }

  return (
    <div className="field-instrument" data-cursor>
      <div className="field-grid" aria-hidden />
      <div className="field-orbit orbit-distant" aria-hidden />
      <div className="field-orbit orbit-near" aria-hidden />
      <button
        type="button"
        className="field-art-motion"
        onClick={() => rotate(1)}
        aria-label="Rotate illustration"
      >
        <span className="field-art-scroll">
          <Image
            key={angle}
            src={"/field/" + views[angle] + ".webp"}
            width={840}
            height={670}
            alt=""
            unoptimized
            loading="eager"
            fetchPriority={angle === 0 ? "high" : "auto"}
            className="field-art"
          />
        </span>
      </button>
      <span className="field-cross cross-one" aria-hidden />
      <span className="field-cross cross-two" aria-hidden />
      <div className="field-selector" role="group" aria-label="Illustration views">
        <Rotate3d size={16} aria-hidden />
        <span className="field-meter" aria-hidden>
          {views.map((view, index) => (
            <i key={view} data-active={angle === index} />
          ))}
        </span>
        <button type="button" aria-label="Previous view" onClick={() => rotate(-1)}>
          <ArrowLeft size={14} aria-hidden />
        </button>
        <button type="button" aria-label="Next view" onClick={() => rotate(1)}>
          <ArrowRight size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}
