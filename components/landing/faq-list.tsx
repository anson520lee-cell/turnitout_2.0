"use client";
import { useId, useState } from "react";
import { Plus } from "lucide-react";
import type { FaqItem } from "@/config/faq";

export function FaqList({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const id = useId();
  return (
    <div className="studio-faq">
      {items.map((item, i) => {
        const expanded = i === open;
        return (
          <div key={item.q} data-open={expanded}>
            <h3>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={id + i}
                id={id + "q" + i}
                onClick={() => setOpen(expanded ? null : i)}
              >
                {item.q}
                <Plus size={17} aria-hidden />
              </button>
            </h3>
            <div
              id={id + i}
              inert={!expanded}
              aria-hidden={!expanded}
              role="region"
              aria-labelledby={id + "q" + i}
              className="faq-answer"
            >
              <div>
                <p>{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
