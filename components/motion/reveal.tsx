import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type DivProps = HTMLAttributes<HTMLDivElement>;
const tiltAttr = (tilt?: boolean | number) => (tilt ? (tilt === true ? "" : String(tilt)) : undefined);

/*
 * Entrances, in the voice of the essay sheet on the home page. All of it is
 * CSS (see "Entrances" in globals.css): the content is in the HTML and
 * visible before any script runs, nothing waits for hydration, and reduced
 * motion, or a browser without scroll-driven animations, simply shows it.
 * Below the fold the entrances follow the scroll position, so they run
 * backwards when you scroll back up.
 *
 * - Reveal: a block of copy rises into place as it scrolls in
 *   (`aboveFold`: once, on load, for content on screen at the start).
 * - Build: one object (its first child) arrives as a 1px outline traced
 *   round its edge, then fills from the top down.
 * - Stagger + StaggerItem: a row of objects, each building a step after the
 *   one before it.
 *
 * `tilt` is kept as the name of the hover response, which is now a lift in
 * three beats (line, object, light), not a tilt; see "Lift" in globals.css.
 */

export function Reveal({
  delay,
  aboveFold,
  tilt,
  className,
  style,
  children,
  ...props
}: DivProps & {
  /** Seconds, for `aboveFold` entrances (a scroll entrance has no clock). */
  delay?: number;
  aboveFold?: boolean;
  tilt?: boolean | number;
}) {
  return (
    <div
      data-reveal={aboveFold ? "intro" : ""}
      data-tilt={tiltAttr(tilt)}
      className={className}
      style={delay ? ({ "--d": `${delay}s`, ...style } as CSSProperties) : style}
      {...props}
    >
      {children}
    </div>
  );
}

/** Wrap exactly one object: the wrapper draws the outline, the child fills in. `r` is the child's corner radius. */
export function Build({ r = 16, className, style, children, ...props }: DivProps & { r?: number }) {
  return (
    <div data-build="" className={className} style={{ "--build-r": `${r}px`, ...style } as CSSProperties} {...props}>
      {children}
    </div>
  );
}

export function Stagger({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div data-stagger="" className={className}>
      {children}
    </div>
  );
}

/** One object in a Stagger: builds in, and lifts on hover when `tilt` is set. */
export function StaggerItem({
  className,
  wrapClassName,
  children,
  tilt,
  r = 16,
}: {
  /** Classes for the object itself (glass, padding, radius). */
  className?: string;
  /** Classes for the grid cell around it. */
  wrapClassName?: string;
  children: ReactNode;
  tilt?: boolean | number;
  r?: number;
}) {
  return (
    <Build r={r} className={cn("h-full", wrapClassName)}>
      <div className={cn("h-full", className)} data-tilt={tiltAttr(tilt)}>
        {children}
      </div>
    </Build>
  );
}
