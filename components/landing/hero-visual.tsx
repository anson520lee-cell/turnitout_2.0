"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
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
    const update = () => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      setOk(mq.matches && !!gl);
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

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setActive((a) => (a + 1) % LABELS.length), 2200);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <div className="relative aspect-[4/4.2] w-full max-w-[560px] select-none" aria-hidden>
      {/* radial lighting, and a contact shadow the document floats over */}
      <div data-depth="-2" className="absolute inset-[-10%] rounded-full bg-[radial-gradient(closest-side,rgb(91_140_255/0.28),rgb(154_123_255/0.12)_55%,transparent_75%)]" />
      <div data-depth="-1" className="absolute inset-0 bg-grid [mask-image:radial-gradient(closest-side,black,transparent)] opacity-50" />
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
