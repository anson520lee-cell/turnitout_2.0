"use client";
import { motion, type HTMLMotionProps } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Framer writes `transform` inline, which would override the CSS tilt from
 * `[data-tilt]`. This template prepends the tilt so both apply.
 */
const withTilt = (_: unknown, generated: string) =>
  `perspective(1100px) rotateX(calc(var(--rx0, 0deg) + var(--rx, 0deg))) rotateY(var(--ry, 0deg)) ${generated === "none" ? "" : generated}`;

function tiltProps(tilt?: boolean | number) {
  if (!tilt) return {};
  return {
    "data-tilt": tilt === true ? "" : String(tilt),
    transformTemplate: withTilt,
  };
}

export function Reveal({
  delay = 0,
  y = 18,
  className,
  children,
  tilt,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number; y?: number; tilt?: boolean | number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, ease, delay }}
      className={className}
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
}: {
  className?: string;
  children: React.ReactNode;
  tilt?: boolean | number;
}) {
  return (
    <motion.div
      className={className}
      {...tiltProps(tilt)}
      variants={{
        hidden: { opacity: 0, y: 22, filter: "blur(6px)" },
        show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.75, ease } },
      }}
    >
      {children}
    </motion.div>
  );
}
