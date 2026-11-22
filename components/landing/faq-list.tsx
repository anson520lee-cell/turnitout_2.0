"use client";
import { useState } from "react";
import type { FaqItem } from "@/config/faq";

/**
 * Questions on hairlines, in the site's line-first voice. Hovering a question
 * draws its rule in accent and nudges it forward a beat later; opening one
 * turns the plus into a cross and wipes the answer in from the top. Closed
 * answers are inert, so they are skipped by keyboard and screen readers.
 */
export function FaqList({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.q} className="faq-item" data-open={isOpen || undefined}>
            <h3>
              <button
                type="button"
                data-press
                className="faq-q"
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                id={`faq-q-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span className="nav-idx">{String(i + 1).padStart(2, "0")}</span>
                <span className="faq-q-text">{it.q}</span>
                <span aria-hidden className="faq-icon">
                  <i />
                  <i />
                </span>
              </button>
            </h3>
            <div id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className="faq-a" inert={!isOpen}>
              <div>
                <p>{it.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
