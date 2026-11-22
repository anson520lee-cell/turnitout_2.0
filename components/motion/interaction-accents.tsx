"use client";

import { useEffect, useRef } from "react";
import { onPointerFrame } from "./pointer-engine";
import "./interaction-accents.css";

const controls = "a[href], button, summary, [role='button'], [data-press]";
const reportTarget = /^#(?:para-\d+|writing-refinement)$/;

function controlFor(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>(controls);
  return el && !el.matches(":disabled, [aria-disabled='true']") ? el : null;
}

/** Temporary, non-interactive light layers. The underlying page keeps its layout and input handling. */
export function InteractionAccents() {
  const layer = useRef<HTMLDivElement>(null);
  const wake = useRef<SVGSVGElement>(null);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = layer.current;
    const trace = wake.current;
    const marker = rail.current;
    if (!host || !trace || !marker) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(pointer: fine)");
    const frame = document.createElement("span");
    frame.className = "interaction-corners";
    frame.setAttribute("aria-hidden", "true");
    host.append(frame);
    let hovered: HTMLElement | null = null;
    let scrollFrame = 0;
    let scrollEnd = 0;
    let lastY = window.scrollY;
    let lastTime = performance.now();
    let pendingTarget: HTMLElement | null = null;
    let targetDeadline = 0;
    let arrival: Animation | null = null;
    let stopTrace: (() => void) | undefined;

    function clearFrame() {
      frame.removeAttribute("data-feedback");
    }

    function onFrameEnd(event: AnimationEvent) {
      if (event.target === frame && !event.pseudoElement) clearFrame();
    }

    function corners(el: HTMLElement, kind: "hover" | "press") {
      if (!host || reduced.matches || document.hidden) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // A native modal is in the browser's top layer. Draw its feedback there too.
      const parent = el.closest("dialog[open]") ?? host;
      if (frame.parentElement !== parent) parent.append(frame);
      Object.assign(frame.style, {
        left: (rect.left - 3) + "px",
        top: (rect.top - 3) + "px",
        width: (rect.width + 6) + "px",
        height: (rect.height + 6) + "px",
      });
      if (frame.dataset.feedback === kind) {
        for (const animation of frame.getAnimations({ subtree: true })) animation.currentTime = 0;
      } else {
        frame.dataset.feedback = kind;
      }
    }

    function syncMotion() {
      stopTrace?.();
      stopTrace = undefined;
      if (!trace || !marker) return;
      trace.style.opacity = "0";
      marker.removeAttribute("data-moving");
      clearFrame();
      arrival?.cancel();
      pendingTarget = null;
      if (reduced.matches || !fine.matches) return;
      const line = trace;
      stopTrace = onPointerFrame((p) => {
        const dx = p.lx - p.x;
        const dy = p.ly - p.y;
        const distance = Math.hypot(dx, dy);
        if (!p.inside || distance < 4 || document.hidden) {
          if (line.style.opacity !== "0") line.style.opacity = "0";
          return;
        }
        const length = Math.min(96, distance * 1.25);
        line.style.opacity = String(Math.min(.84, distance / 45));
        line.style.transform = `translate3d(${p.x}px,${p.y - 12}px,0) rotate(${Math.atan2(dy, dx)}rad) scaleX(${length / 96})`;
      });
    }

    function onHover(event: PointerEvent) {
      if (event.pointerType !== "mouse" || !fine.matches || reduced.matches) return;
      const next = controlFor(event.target);
      if (next === hovered) return;
      hovered = next;
      if (next) corners(next, "hover");
    }

    function onFocus(event: FocusEvent) {
      const next = controlFor(event.target);
      if (next?.matches(":focus-visible")) corners(next, "hover");
    }

    function onClick(event: MouseEvent) {
      if (event.button !== 0 || reduced.matches) return;
      const next = controlFor(event.target);
      if (next) corners(next, "press");
      // Browsers omit hashchange when a reader follows the same anchor twice.
      const href = next?.getAttribute("href");
      if (href && href === window.location.hash && reportTarget.test(href)) markDestination();
    }

    function markDestination() {
      if (reduced.matches) return;
      const hash = window.location.hash;
      pendingTarget = reportTarget.test(hash) ? document.getElementById(hash.slice(1)) : null;
      if (pendingTarget) {
        targetDeadline = performance.now() + 4000;
        scheduleSettle();
      }
    }

    function settle() {
      marker?.removeAttribute("data-moving");
      if (!pendingTarget) return;
      const target = pendingTarget;
      if (!target.isConnected || reduced.matches || document.hidden || performance.now() > targetDeadline) {
        pendingTarget = null;
        return;
      }
      // A smooth anchor jump can pause before the first scroll event, especially
      // on a long report. Wait until the intended card has actually arrived.
      const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const destination = Math.max(0, Math.min(maxY, window.scrollY + target.getBoundingClientRect().top - margin));
      if (Math.abs(window.scrollY - destination) > 4) return;
      pendingTarget = null;
      arrival?.cancel();
      arrival = target.animate([
        { outline: "1px solid transparent", outlineOffset: "7px" },
        { outline: "1px solid rgba(141,179,255,.9)", outlineOffset: "2px", offset: .24 },
        { outline: "1px solid transparent", outlineOffset: "0px" },
      ], { duration: 620, easing: "ease-out" });
    }

    function scheduleSettle() {
      window.clearTimeout(scrollEnd);
      scrollEnd = window.setTimeout(settle, 140);
    }

    function paintScroll() {
      scrollFrame = 0;
      if (!marker || reduced.matches || document.hidden) return;
      const y = window.scrollY;
      const now = performance.now();
      const delta = y - lastY;
      const speed = Math.min(1, Math.abs(delta) / Math.max(12, now - lastTime) / 2.5);
      lastY = y;
      lastTime = now;
      const range = document.documentElement.scrollHeight - window.innerHeight;
      if (range <= 0 || !delta) return;
      const progress = Math.max(0, Math.min(1, y / range));
      const position = 24 + progress * Math.max(0, window.innerHeight - 80);
      marker.style.transform = `translate3d(0,${position}px,0) scaleY(${delta > 0 ? 1 : -1})`;
      marker.style.setProperty("--trace-length", (12 + 34 * speed) + "px");
      marker.dataset.moving = "";
    }

    function onScroll() {
      if (reduced.matches || document.hidden) return;
      clearFrame();
      if (!scrollFrame) scrollFrame = requestAnimationFrame(paintScroll);
      scheduleSettle();
    }

    function quiet() {
      clearFrame();
      hovered = null;
      if (trace) trace.style.opacity = "0";
      marker?.removeAttribute("data-moving");
      pendingTarget = null;
      arrival?.cancel();
      cancelAnimationFrame(scrollFrame);
      window.clearTimeout(scrollEnd);
      scrollFrame = 0;
      lastY = window.scrollY;
      lastTime = performance.now();
    }

    syncMotion();
    frame.addEventListener("animationend", onFrameEnd);
    fine.addEventListener("change", syncMotion);
    reduced.addEventListener("change", syncMotion);
    document.addEventListener("pointerover", onHover, { passive: true });
    document.addEventListener("focusin", onFocus);
    document.addEventListener("click", onClick, { capture: true, passive: true });
    document.addEventListener("visibilitychange", quiet);
    window.addEventListener("blur", quiet);
    window.addEventListener("beforeprint", quiet);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", settle);
    window.addEventListener("hashchange", markDestination);
    return () => {
      stopTrace?.();
      quiet();
      frame.removeEventListener("animationend", onFrameEnd);
      frame.remove();
      fine.removeEventListener("change", syncMotion);
      reduced.removeEventListener("change", syncMotion);
      document.removeEventListener("pointerover", onHover);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", quiet);
      window.removeEventListener("blur", quiet);
      window.removeEventListener("beforeprint", quiet);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", settle);
      window.removeEventListener("hashchange", markDestination);
    };
  }, []);

  return (
    <div ref={layer} className="interaction-accents" aria-hidden="true">
      <svg ref={wake} className="interaction-wake" viewBox="0 0 96 24" fill="none">
        <path d="M5 12 C22 12 34 3 52 7 S78 14 94 7" />
        <path d="M5 12 C24 12 37 9 55 12 S80 17 93 13" />
        <path d="M8 13 C26 14 40 17 56 17 S77 16 88 19" />
      </svg>
      <div ref={rail} className="interaction-scroll-trace" />
    </div>
  );
}
