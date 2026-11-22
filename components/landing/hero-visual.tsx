"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowUpRight, ScanLine, X } from "lucide-react";
import styles from "./writing-atlas.module.css";

export function HeroVisual() {
  const [open, setOpen] = useState(false);
  const frame = useRef<number | null>(null);
  const stage = useRef<HTMLButtonElement>(null);
  const point = useRef({ x: 0, y: 0 });
  function resetLens() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    stage.current?.removeAttribute("data-exploring");
  }
  useEffect(() => resetLens, []);
  function explore(event: PointerEvent<HTMLButtonElement>) {
    if (open || event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    point.current = { x: event.clientX, y: event.clientY };
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const el = stage.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();
      const x = point.current.x - bounds.left;
      const y = point.current.y - bounds.top;
      el.style.setProperty("--px", x + "px");
      el.style.setProperty("--py", y + "px");
      el.style.setProperty("--dx", ((x / bounds.width - .5) * 13) + "px");
      el.style.setProperty("--dy", ((y / bounds.height - .5) * 12) + "px");
      el.dataset.exploring = "true";
    });
  }
  return (
    <figure className={styles.instrument}>
      <figcaption className={styles.bar}><span><i /> Document study</span><span>Fig. 01</span></figcaption>
      <button ref={stage} type="button" className={styles.stage}
        data-open={open} aria-expanded={open} aria-controls="sample-annotation"
        aria-label={open ? "Close sample annotation" : "Inspect sample annotation"}
        onPointerMove={explore} onPointerLeave={resetLens}
        onClick={() => { resetLens(); setOpen(!open); }}
        onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
        <span aria-hidden className={styles.art}>
          <Image src="/landing/paper-relief.webp" alt="" width={1159} height={850} sizes="(min-width: 1024px) 600px, 94vw" unoptimized loading="eager" />
        </span>
        <span aria-hidden className={styles.xray} />
        <span aria-hidden className={styles.lens} />
        <span className={styles.note} id="sample-annotation" aria-hidden={!open}>
          <span className={styles.noteMeta}>Sample annotation</span>
          <span className={styles.quote}>“<mark>It is important to note</mark> that the surveys differed in length.”</span>
          <span className={styles.explanation}>The opening phrase delays the finding. Try starting with “The surveys differed in length.”</span>
        </span>
        <span className={styles.stageFoot}><span><ScanLine size={14} />{open ? "Close annotation" : "Inspect a sentence"}</span>{open ? <X size={16}/> : <ArrowUpRight size={16}/>}</span>
      </button>
    </figure>
  );
}
