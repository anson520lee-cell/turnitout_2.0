"use client";
import { useId, useState } from "react";
import { Plus } from "lucide-react";
import type { FaqItem } from "@/config/faq";

export function FaqList({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const id = useId();
  return (
    <div className="signal-faq">
      {items.map((item, i) => {
        const expanded = open === i;
        const question = `${id}-q${i}`,
          answer = `${id}-a${i}`;
        return (
          <div key={item.q} data-expanded={expanded}>
            <h3>
              <button
                type="button"
                id={question}
                aria-expanded={expanded}
                aria-controls={answer}
                onClick={() => setOpen(expanded ? null : i)}
              >
                <i aria-hidden />
                <span>{item.q}</span>
                <Plus size={16} aria-hidden />
              </button>
            </h3>
            <div id={answer} role="region" aria-labelledby={question} hidden={!expanded}>
              <p>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
