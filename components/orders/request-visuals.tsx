"use client";

import { useRef } from "react";
import styles from "./request-visuals.module.css";

export function ReportVisual({ className }: { className?: string }) {
  const glint = useRef<HTMLDivElement>(null);
  const sweep = useRef<Animation | null>(null);

  return (
    <div
      id="inference-field"
      aria-hidden="true"
      className={`${styles.field} ${className ?? ""}`}
      onPointerMove={event => {
        if (event.pointerType === "touch" || !event.isPrimary) return;
        const field = event.currentTarget;
        const bounds = field.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        field.style.setProperty("--pointer-x", `${x}px`);
        field.style.setProperty("--pointer-y", `${y}px`);
        field.style.setProperty("--shift-x", `${(x / bounds.width - .5) * 5}px`);
        field.style.setProperty("--shift-y", `${(y / bounds.height - .5) * 5}px`);
        field.dataset.hover = "true";
      }}
      onPointerLeave={event => { delete event.currentTarget.dataset.hover; }}
      onClick={() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        sweep.current?.cancel();
        sweep.current = glint.current?.animate([
          { maskPosition: "100% 50%", opacity: 0 },
          { maskPosition: "78% 50%", opacity: .8, offset: .25 },
          { maskPosition: "20% 50%", opacity: .65, offset: .78 },
          { maskPosition: "0% 50%", opacity: 0 },
        ], { duration: 720, easing: "ease-out" }) ?? null;
      }}
    >
      <div className={styles.light} ref={glint} />
    </div>
  );
}
