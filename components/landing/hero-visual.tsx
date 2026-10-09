"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { CssDocument } from "./css-document";
import { AgentTerminal } from "./agent-terminal";

const HeroScene = dynamic(() => import("@/components/three/hero-scene"), {
  ssr: false,
  loading: () => null,
});

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

  return (
    <div className="w-full max-w-[560px] lg:max-w-[700px]" aria-hidden>
      <div className="relative aspect-[4/4.2] w-full select-none">
        {/* radial lighting, and a contact shadow the document floats over */}
        <div
          data-depth="-2"
          className="absolute inset-[-24%] bg-[radial-gradient(closest-side,rgb(91_140_255/0.26),rgb(110_130_255/0.17)_22%,rgb(130_125_255/0.09)_42%,rgb(154_123_255/0.04)_62%,rgb(154_123_255/0.012)_80%,transparent)]"
        />
        <div
          data-depth="-1"
          className="absolute inset-[-12%] bg-grid [mask-image:radial-gradient(closest-side,black_30%,transparent)] opacity-50"
        />
        {/* the document: centred on phones, on the right where the terminal sits beside it */}
        <div className="absolute inset-0 sm:left-[24%] sm:-right-[6%]">
          <div
            data-depth="-3"
            className="absolute inset-x-[22%] bottom-[6%] h-10 rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.8),transparent)]"
          />
          {use3D ? <HeroScene /> : <CssDocument wide />}
        </div>
        {/* the agent's console: every run read-out, live */}
        <div
          data-depth="2"
          className="absolute -left-[2%] bottom-[10%] z-10 hidden w-[44%] sm:block"
        >
          <AgentTerminal />
        </div>
      </div>
      {/* phones: the console sits under the page instead of beside it */}
      <AgentTerminal className="-mt-4 sm:hidden" />
    </div>
  );
}
