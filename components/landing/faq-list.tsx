import { useId } from "react";
import type { FaqItem } from "@/config/faq";

export function FaqList({ items }: { items: FaqItem[] }) {
  const group = useId();

  return (
    <div className="orb-questions">
      {items.map(({ q, a }) => (
        <details key={q} name={group}>
          <summary>{q}<span aria-hidden="true" /></summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
