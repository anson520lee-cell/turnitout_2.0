"use client";
import { createContext, useContext, useRef, type ReactNode } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * A small 3D stage for illustrations: the rig leans toward the cursor,
 * layers sit at different depths (so they separate as it turns), a glare
 * follows the cursor like a light source, and a soft floor shadow slides the
 * opposite way. At rest it floats gently. Mouse only; reduced-motion and
 * touch users get the static composition.
 */

type Pointer = { x: MotionValue<number>; y: MotionValue<number> };
const PointerContext = createContext<Pointer | null>(null);

export function DepthStage({
  children,
  className,
  tilt = 14,
  glare = true,
}: {
  children: ReactNode;
  className?: string;
  /** Degrees at the edge. */
  tilt?: number;
  glare?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  // -0.5…0.5 across the stage.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 140, damping: 18, mass: 0.6 };
  const x = useSpring(px, spring);
  const y = useSpring(py, spring);
  const rotateY = useTransform(x, [-0.5, 0.5], [-tilt, tilt]);
  const rotateX = useTransform(y, [-0.5, 0.5], [tilt * 0.8, -tilt * 0.8]);
  // The glare layer is 1.5x the stage; keep its hot spot inside the middle
  // two-thirds so the gradient fades out well before the layer's edges.
  const glareX = useTransform(x, [-0.5, 0.5], [30, 70]);
  const glareY = useTransform(y, [-0.5, 0.5], [28, 72]);
  const glareBg = useMotionTemplate`radial-gradient(240px circle at ${glareX}% ${glareY}%, rgb(190 210 255 / 0.2), rgb(154 123 255 / 0.07) 40%, transparent 68%)`;
  const shadowX = useTransform(x, [-0.5, 0.5], [22, -22]);
  const shadowScale = useTransform(y, [-0.5, 0.5], [0.92, 1.06]);

  return (
    <PointerContext.Provider value={{ x, y }}>
      <div
        ref={ref}
        aria-hidden
        onPointerMove={(e) => {
          if (reduce || e.pointerType !== "mouse" || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width - 0.5);
          py.set((e.clientY - r.top) / r.height - 0.5);
        }}
        onPointerLeave={() => {
          px.set(0);
          py.set(0);
        }}
        className={cn("relative select-none [perspective:1100px]", className)}
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-[12%] bottom-[-6%] h-[18%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.65),transparent)] blur-xl"
          style={reduce ? undefined : { x: shadowX, scaleX: shadowScale }}
        />
        {/* Bobs on the compositor (CSS; reduced motion stops it globally), not a JS animation every frame. */}
        <div className="doc-bob relative size-full">
          <motion.div
            className="relative size-full [transform-style:preserve-3d]"
            style={reduce ? undefined : { rotateX, rotateY }}
          >
            {children}
            {glare && !reduce && (
              <motion.div
                className="pointer-events-none absolute inset-[-25%] mix-blend-screen"
                style={{ background: glareBg, z: 120 }}
              />
            )}
          </motion.div>
        </div>
      </div>
    </PointerContext.Provider>
  );
}

/** A layer `depth` px in front of the stage plane. Extra `drift` adds parallax. */
export function DepthLayer({
  depth,
  drift = 0,
  className,
  children,
}: {
  depth: number;
  /** Extra sideways travel (px at the edge) on top of the 3D rotation. */
  drift?: number;
  className?: string;
  children: ReactNode;
}) {
  const p = useContext(PointerContext);
  const reduce = usePrefersReducedMotion();
  const fallback = useMotionValue(0);
  const dx = useTransform(p?.x ?? fallback, [-0.5, 0.5], [-drift, drift]);
  const dy = useTransform(p?.y ?? fallback, [-0.5, 0.5], [-drift * 0.6, drift * 0.6]);
  return (
    <motion.div
      className={cn("absolute", className)}
      style={{ z: depth, ...(reduce || !drift ? {} : { x: dx, y: dy }) }}
    >
      {children}
    </motion.div>
  );
}
