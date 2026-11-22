"use client";
import { useState } from "react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";

const stops = [
  { href: "/services", name: "Services", detail: "See what the writing report covers." },
  { href: "/how-it-works", name: "How it works", detail: "Follow a document from draft to report." },
  { href: "/sample-report", name: "Sample report", detail: "Explore a paragraph map and marked sentences." },
  { href: "/pricing", name: "Pricing", detail: "Check the price for your document length." },
];

export function ProductChart() {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <nav
      className="product-chart"
      aria-label="Product destinations"
      onPointerLeave={() => setHover(null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHover(null);
      }}
    >
      <h2 className="orbit-micro">Explore the product</h2>
      <ol>
        {stops.map((stop, i) => (
          <li key={stop.href} data-active={hover === i}>
            <Link href={stop.href} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)}>
              <i aria-hidden />
              <span>{stop.name}</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="chart-detail">{hover !== null ? stops[hover].detail : null}</p>
    </nav>
  );
}
