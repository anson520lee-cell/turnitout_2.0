"use client";
import { useEffect, useState } from "react";

export function ReadingIndex({ headings }: { headings: { id: string; title: string }[] }) {
  const [active, setActive] = useState(headings[0]?.id);
  useEffect(() => {
    const elements = headings.map((h) => document.getElementById(h.id)).filter((el) => el !== null);
    let frame = 0;
    function update() {
      frame = 0;
      let current = elements[0];
      for (const el of elements) {
        if (el.getBoundingClientRect().top > innerHeight * 0.32) break;
        current = el;
      }
      if (current) setActive(current.id);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [headings]);
  return (
    <nav aria-label="On this page" className="reading-rail">
      <p className="orbit-micro">On this page</p>
      {headings.map((h) => (
        <a key={h.id} href={`#${h.id}`} aria-current={active === h.id ? "location" : undefined}>
          <i aria-hidden />
          {h.title}
        </a>
      ))}
    </nav>
  );
}
