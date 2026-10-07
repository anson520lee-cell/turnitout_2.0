"use client";
import { motion, type HTMLMotionProps } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Framer writes `transform` inline, which would override the CSS tilt from
 * `[data-tilt]`. This template prepends the tilt so both apply. It also
 * carries the lift in Z, matching the CSS rule.
 */
const withTilt = (_: unknown, generated: string) =>
  `perspective(1000px) rotateX(calc(var(--rx0, 0deg) + var(--rx, 0deg))) rotateY(var(--ry, 0deg)) translateZ(calc(var(--lift, 0) * 12px)) ${generated === "none" ? "" : generated}`;

function tiltProps(tilt?: boolean | number) {
  if (!tilt) return {};
  return {
    "data-tilt": tilt === true ? "" : String(tilt),
    transformTemplate: withTilt,
  };
}

/**
 * Entrances swing up out of the page: a few degrees of rotateX around the
 * bottom edge, with depth, settling flat. With reduced motion Framer skips the
 * transform and only fades.
 */
const hidden = (y: number, flip: number) => ({
  opacity: 0,
  y,
  rotateX: flip,
  scale: 0.97,
  transformPerspective: 1200,
  filter: "blur(4px)",
});
const shown = { opacity: 1, y: 0, rotateX: 0, scale: 1, filter: "blur(0px)" };

export function Reveal({
  delay = 0,
  y = 26,
  flip = 14,
  aboveFold,
  className,
  children,
  tilt,
  ...props
}: HTMLMotionProps<"div"> & {
  delay?: number;
  y?: number;
  flip?: number;
  tilt?: boolean | number;
  /**
   * For content visible on load (hero, page headers): the server sends it
   * visible, and only the depth swing plays once the script runs, so the
   * first paint already shows the text.
   */
  aboveFold?: boolean;
}) {
  const motionProps = aboveFold
    ? {
        initial: { y: Math.min(y, 12), rotateX: flip / 2, transformPerspective: 1200 },
        animate: { y: 0, rotateX: 0 },
      }
    : { initial: hidden(y, flip), whileInView: shown, viewport: { once: true, margin: "-80px" } };
  return (
    <motion.div
      {...motionProps}
      transition={{ duration: 0.9, ease, delay }}
      className={["reveal-3d", className].filter(Boolean).join(" ")}
      {...tiltProps(tilt)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  className,
  children,
  gap = 0.08,
}: {
  className?: string;
  children: React.ReactNode;
  gap?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  className,
  children,
  tilt,
  z,
  hoverZ,
}: {
  className?: string;
  children: React.ReactNode;
  tilt?: boolean | number;
  /** Depth in px above its parent, when the parent keeps its children in 3D. */
  z?: number;
  /** Depth while hovered: the item rises toward the viewer. */
  hoverZ?: number;
}) {
  return (
    <motion.div
      className={["reveal-3d", className].filter(Boolean).join(" ")}
      style={z !== undefined ? { z } : undefined}
      whileHover={hoverZ !== undefined ? { z: hoverZ, transition: { type: "spring", stiffness: 260, damping: 22 } } : undefined}
      {...tiltProps(tilt)}
      variants={{
        hidden: hidden(30, 22),
        show: { ...shown, transition: { duration: 0.85, ease } },
      }}
    >
      {children}
    </motion.div>
  );
}
