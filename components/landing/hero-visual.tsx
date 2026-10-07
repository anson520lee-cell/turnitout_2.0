"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { CssDocument } from "./css-document";

const HeroScene = dynamic(() => import("@/components/three/hero-scene"), {
  ssr: false,
  loading: () => null,
});

const LABELS = ["Sentence Variation", "Structure", "Lexical Pattern", "Similarity"];
const POS = [
  "left-[2%] top-[20%]",
  "right-[0%] top-[34%]",
  "left-[6%] bottom-[22%]",
  "right-[4%] bottom-[14%]",
];

function useCanRender3D() {
  const reduce = usePrefersReducedMotion();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    let supported: boolean | null = null;
    const update = () => {
      // Phones and tablets never get the 3D scene, so don't pay for a WebGL
      // context there: creating one costs up to seconds on a mobile CPU.
      if (!mq.matches) return setOk(false);
      if (supported === null) {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        supported = !!gl;
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
      }
      setOk(supported);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return ok && !reduce;
}

export function HeroVisual() {
  const use3D = useCanRender3D();
  const [active, setActive] = useState(0);
  const reduce = usePrefersReducedMotion();
  const root = useRef<HTMLDivElement>(null);

  // Cycle the labels only where they're shown (sm and up) and while on screen.
  useEffect(() => {
    const el = root.current;
    if (reduce || !el) return;
    const wide = window.matchMedia("(min-width: 640px)");
    let visible = false;
    let t: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(t);
      t = undefined;
      if (visible && wide.matches) t = setInterval(() => setActive((a) => (a + 1) % LABELS.length), 2200);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(el);
    wide.addEventListener("change", sync);
    return () => {
      io.disconnect();
      wide.removeEventListener("change", sync);
      clearInterval(t);
    };
  }, [reduce]);

  return (
    <div ref={root} className="relative aspect-[4/4.2] w-full max-w-[560px] select-none" aria-hidden>
      {/* radial lighting, and a contact shadow the document floats over */}
      <div data-depth="-2" className="absolute inset-[-24%] bg-[radial-gradient(closest-side,rgb(91_140_255/0.26),rgb(110_130_255/0.17)_22%,rgb(130_125_255/0.09)_42%,rgb(154_123_255/0.04)_62%,rgb(154_123_255/0.012)_80%,transparent)]" />
      <div data-depth="-1" className="absolute inset-[-12%] bg-grid [mask-image:radial-gradient(closest-side,black_30%,transparent)] opacity-50" />
      <div data-depth="-3" className="absolute inset-x-[22%] bottom-[6%] h-10 rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.8),transparent)]" />
      {use3D ? <HeroScene /> : <CssDocument />}
      {LABELS.map((l, i) => (
        // Labels float in front of the document, so they drift further.
        <div key={l} data-depth={i % 2 ? "3" : "2"} className={`absolute ${POS[i]} hidden sm:block`}>
          <AnimatePresence>
            {(reduce || i === active || i === (active + 2) % LABELS.length) && (
              <motion.div
                initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                transition={{ duration: 0.6 }}
                className="glass flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-muted"
              >
                <span className="size-1.5 rounded-full bg-cyan shadow-[0_0_10px_#5fd8f5]" />
                {l}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
