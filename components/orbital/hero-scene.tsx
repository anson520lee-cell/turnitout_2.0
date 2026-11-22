"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function HeroScene({ children }: { children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!section.current || !art.current || !progress.current) return;
    const hero = section.current;
    const image = art.current;
    const line = progress.current;

    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const finePointer = window.matchMedia("(any-pointer: fine)");
    let mouseSeen = false;
    let frame = 0;
    let x = 0;
    let y = 0;
    let pastHero = false;

    function draw() {
      frame = 0;
      const offset = Math.max(0, window.scrollY);
      const maximum = document.documentElement.scrollHeight - window.innerHeight;
      line.style.transform = `scaleX(${maximum > 0 ? Math.min(1, offset / maximum) : 0})`;
      if (!motion.matches || (!finePointer.matches && !mouseSeen)) {
        image.style.removeProperty("transform");
        return;
      }

      pastHero = offset > hero.offsetHeight;
      if (!pastHero) {
        image.style.transform = `translate3d(${x * 20}px, ${y * 17 + offset * 0.13}px, 0) scale(1.055)`;
      }
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(draw);
    }

    function move(event: PointerEvent) {
      if (!motion.matches || pastHero || event.pointerType !== "mouse") return;
      mouseSeen = true;
      const box = hero.getBoundingClientRect();
      x = (event.clientX - box.left) / box.width - 0.5;
      y = (event.clientY - box.top) / box.height - 0.5;
      schedule();
    }

    function reset() {
      x = 0;
      y = 0;
      schedule();
    }

    draw();
    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", reset);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", reset);
    return () => {
      window.cancelAnimationFrame(frame);
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", reset);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", reset);
    };
  }, []);

  return (
    <>
      <span className="orb-progress" ref={progress} aria-hidden="true" />
      <section className="orb-hero" ref={section} aria-labelledby="home-title">
        <div className="orb-hero-frame" aria-hidden="true">
          <div className="orb-hero-art" ref={art} />
          <div className="orb-hero-grid" />
          <div className="orb-hero-crosshair">
            <span />
            <span />
          </div>
        </div>
        {children}
      </section>
    </>
  );
}
