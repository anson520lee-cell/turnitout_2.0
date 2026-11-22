"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A reading lens for ordinary page content: the DOM sibling of the WebGL lens
 * over the essay on the home page. `reveal` is a second copy of the content
 * (the detector's view of it), drawn only inside a circle that follows the
 * pointer, with thin contour rings round it.
 *
 * It moves the way the home lens does: a fast sweep widens it and drags a
 * trail behind; when the pointer slows it settles into a smaller reading
 * glass; when the pointer leaves it closes first (or glides back to `focus`,
 * if one is set). On touch it follows the finger while it is down. `sweep`
 * makes it read across once by itself when it first comes into view.
 *
 * Per frame it writes six CSS variables on its own box and three circles'
 * attributes; nothing else, and nothing while it is still or off screen.
 * Reduced motion: no trail, no sweep, the lens jumps instead of gliding.
 */
export function LensReveal({
  children,
  reveal,
  className,
  size = 78,
  sweep,
  focus,
  onRead,
}: {
  children: ReactNode;
  /** The detector view, laid exactly over `children`. Decorative: it is hidden from assistive tech. */
  reveal: ReactNode;
  className?: string;
  /** Resting radius in px. */
  size?: number;
  sweep?: boolean;
  /** Where the lens rests when no pointer is over it, in px inside the box. */
  focus?: { x: number; y: number } | null;
  /** Called with the lens centre (px inside the box) when it settles somewhere new under a pointer. */
  onRead?: (x: number, y: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const rings = useRef<SVGSVGElement>(null);
  const focusRef = useRef(focus);
  const readRef = useRef(onRead);
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    focusRef.current = focus;
    readRef.current = onRead;
    kick.current();
  }, [focus, onRead]);

  useEffect(() => {
    const el = box.current;
    const svg = rings.current;
    if (!el || !svg) return;
    const circles = Array.from(svg.querySelectorAll("circle"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // head, trail and radius springs (px)
    const head = { x: 0, y: 0, vx: 0, vy: 0 };
    const trail = { x: 0, y: 0 };
    let r = 0;
    let rv = 0;
    let tr = 0;
    let target: { x: number; y: number } | null = null;
    let pointerIn = false;
    let touching = false;
    // after a tap the lens stays where the finger was for a moment
    let pinUntil = 0;
    let speed = 0;
    let lastMove = 0;
    let lastT = 0;
    let raf = 0;
    let visible = false;
    let swept = false;
    let sweepAt = -1;
    let readAt = { x: -9999, y: -9999 };
    let written = "";

    const now = () => performance.now() / 1000;
    const wake = () => {
      if (!raf && visible) raf = requestAnimationFrame(frame);
    };
    kick.current = wake;

    function frame(ms: number) {
      raf = 0;
      const t = ms / 1000;
      const dt = Math.min(0.05, lastT ? t - lastT : 1 / 60);
      lastT = t;
      const w = el!.clientWidth;
      const h = el!.clientHeight;

      // where the lens wants to be, and how big
      let goal: { x: number; y: number } | null = null;
      let rGoal = 0;
      if (sweepAt >= 0) {
        const p = (t - sweepAt) / 2.4;
        if (p >= 1 || pointerIn) {
          sweepAt = -1;
        } else {
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          goal = { x: w * (0.12 + 0.76 * e), y: h * 0.5 };
          rGoal = size * (p < 0.08 ? p / 0.08 : p > 0.9 ? (1 - p) / 0.1 : 1);
        }
      }
      if (!goal && (pointerIn || touching || t < pinUntil) && target) {
        goal = target;
        const still = t - lastMove > 0.5;
        rGoal = size * (still ? 0.84 : 1 + Math.min(speed / 1900, 0.75));
      } else if (!goal && focusRef.current) {
        goal = focusRef.current;
        rGoal = size * 0.84;
      }

      let busy = false;
      if (goal) {
        if (r < 1 || reduced) {
          // opening (or reduced motion): start where it is wanted, no glide in from elsewhere
          if (r < 1) {
            head.x = trail.x = goal.x;
            head.y = trail.y = goal.y;
            head.vx = head.vy = 0;
          }
          if (reduced) {
            head.x = trail.x = goal.x;
            head.y = trail.y = goal.y;
          }
        }
        if (!reduced) {
          const k = 260;
          const c = 2 * Math.sqrt(k) * 0.92;
          head.vx += (k * (goal.x - head.x) - c * head.vx) * dt;
          head.vy += (k * (goal.y - head.y) - c * head.vy) * dt;
          head.x += head.vx * dt;
          head.y += head.vy * dt;
        }
        busy ||= Math.hypot(goal.x - head.x, goal.y - head.y) > 0.3 || Math.hypot(head.vx, head.vy) > 2;
      }
      // the trail drags behind the head; it only shows while the lens is moving fast
      const tf = 1 - Math.exp(-(reduced ? 60 : 7.5) * dt);
      trail.x += (head.x - trail.x) * tf;
      trail.y += (head.y - trail.y) * tf;
      const lag = Math.hypot(head.x - trail.x, head.y - trail.y);
      busy ||= lag > 0.4;

      // radius: closes faster than it opens, so leaving reads as "lines go first"
      if (reduced) {
        r = rGoal;
        rv = 0;
      } else {
        const k = rGoal < r ? 320 : 180;
        const c = 2 * Math.sqrt(k) * (rGoal < r ? 1 : 0.8);
        rv += (k * (rGoal - r) - c * rv) * dt;
        r = Math.max(0, r + rv * dt);
        if (rGoal === 0 && r < 0.6) r = rv = 0;
      }
      busy ||= Math.abs(rGoal - r) > 0.25 || Math.abs(rv) > 1;
      tr = reduced ? 0 : Math.min(r * 0.78, lag * 0.9);
      speed *= Math.exp(-6 * dt);
      busy ||= speed > 20 || sweepAt >= 0 || ((pointerIn || touching) && t - lastMove < 0.6) || (pinUntil > 0 && t < pinUntil + 0.05);

      const vals = `${head.x.toFixed(1)}|${head.y.toFixed(1)}|${r.toFixed(1)}|${trail.x.toFixed(1)}|${trail.y.toFixed(1)}|${tr.toFixed(1)}`;
      if (vals !== written) {
        written = vals;
        const s = el!.style;
        s.setProperty("--lx", `${head.x.toFixed(1)}px`);
        s.setProperty("--ly", `${head.y.toFixed(1)}px`);
        s.setProperty("--lr", `${r.toFixed(1)}px`);
        s.setProperty("--tx", `${trail.x.toFixed(1)}px`);
        s.setProperty("--ty", `${trail.y.toFixed(1)}px`);
        s.setProperty("--tr", `${tr.toFixed(1)}px`);
        const [c0, c1, c2] = circles;
        c0.setAttribute("cx", head.x.toFixed(1));
        c0.setAttribute("cy", head.y.toFixed(1));
        c0.setAttribute("r", Math.max(0, r).toFixed(1));
        c1.setAttribute("cx", head.x.toFixed(1));
        c1.setAttribute("cy", head.y.toFixed(1));
        c1.setAttribute("r", Math.max(0, r * 1.16 + 4).toFixed(1));
        c2.setAttribute("cx", trail.x.toFixed(1));
        c2.setAttribute("cy", trail.y.toFixed(1));
        c2.setAttribute("r", Math.max(0, tr).toFixed(1));
        el!.dataset.lens = r > 1 ? "on" : "";
      }

      // tell the owner what is being read, once the lens has settled somewhere new
      const settled = r > size * 0.5 && Math.hypot(head.vx, head.vy) < 60;
      if (readRef.current && settled && (pointerIn || touching) && Math.hypot(head.x - readAt.x, head.y - readAt.y) > 14) {
        readAt = { x: head.x, y: head.y };
        readRef.current(head.x, head.y);
      }

      if (busy) raf = requestAnimationFrame(frame);
      else lastT = 0;
    }

    const local = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && !touching) return;
      const p = local(e);
      const t = now();
      if (target && lastMove) {
        const d = Math.hypot(p.x - target.x, p.y - target.y);
        const dt = Math.max(0.008, t - lastMove);
        speed += (d / dt - speed) * 0.35;
      }
      target = p;
      lastMove = t;
      pointerIn = e.pointerType === "mouse" ? true : pointerIn;
      wake();
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointerIn = false;
      readAt = { x: -9999, y: -9999 };
      wake();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      touching = true;
      target = local(e);
      lastMove = now();
      speed = 0;
      readAt = { ...target };
      readRef.current?.(target.x, target.y);
      wake();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !touching) return;
      touching = false;
      lastMove = now();
      pinUntil = lastMove + 1.6;
      wake();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && sweep && !swept && !reduced && entry.intersectionRatio > 0.55) {
          swept = true;
          sweepAt = now();
        }
        if (visible) wake();
        else if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
          lastT = 0;
        }
      },
      { threshold: [0, 0.6] },
    );
    io.observe(el);
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    el.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      io.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (raf) cancelAnimationFrame(raf);
      kick.current = () => {};
    };
  }, [size, sweep]);

  return (
    <div ref={box} className={className ? `lens-reveal ${className}` : "lens-reveal"}>
      {children}
      <div className="lens-reveal-view" aria-hidden>
        {reveal}
      </div>
      <svg ref={rings} className="lens-reveal-rings" aria-hidden>
        <circle r="0" />
        <circle r="0" />
        <circle r="0" />
      </svg>
    </div>
  );
}
