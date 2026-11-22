import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The site's headline, in the voice of the home page's "Know before / you
 * submit.": one solid line and, optionally, a second line drawn as a 1px
 * outline. The outline is an SVG erode filter (#lens-outline, defined once in
 * the root layout by <OutlineDefs />); `-webkit-text-stroke` would also draw
 * the variable font's inner overlaps.
 *
 * Each line rises out of its own slot: on load for a page title (`intro`),
 * with the scroll for section titles. Both are CSS only, so the text is in
 * the HTML and readable before any script runs, and reduced motion shows it
 * still.
 */
export function Headline({
  as: Tag = "h2",
  solid,
  outline,
  size = "section",
  align = "left",
  intro,
  id,
  className,
}: {
  as?: "h1" | "h2" | "h3" | "p";
  solid: ReactNode;
  outline?: ReactNode;
  size?: "page" | "section" | "statement";
  align?: "left" | "center";
  intro?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <Tag id={id} className={cn("lh", `lh-${size}`, align === "center" && "lh-center", intro ? "lh-intro" : "lh-scroll", className)}>
      <span className="lh-line" style={{ "--i": 0 } as CSSProperties}>
        <span>{solid}</span>
      </span>
      {outline ? (
        <>
          {" "}
          <span className="lh-line lh-outline" style={{ "--i": 1 } as CSSProperties}>
            <span>{outline}</span>
          </span>
        </>
      ) : null}
    </Tag>
  );
}

/**
 * The outline filter the headlines use. Rendered once, in the root layout.
 * Erode the glyphs' alpha by ~1px and keep only the ring that was removed.
 */
export function OutlineDefs() {
  return (
    <svg width="0" height="0" className="pointer-events-none absolute" aria-hidden focusable="false">
      <filter id="lens-outline" x="-5%" y="-20%" width="110%" height="140%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="erode" radius="1.15" result="core" />
        <feComposite in="SourceAlpha" in2="core" operator="out" result="ring" />
        <feFlood floodColor="#e9edf7" floodOpacity="0.9" />
        <feComposite in2="ring" operator="in" />
      </filter>
    </svg>
  );
}
