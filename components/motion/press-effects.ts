/**
 * Press feedback for buttons and clickable cards, on mouse and touch alike.
 *
 * One delegated `pointerdown` listener. For the pressed element (anything
 * matching PRESSABLE) it:
 * - sets `data-pressed` until the pointer is released, so CSS can sink the
 *   control (`:active` alone is unreliable on iOS);
 * - sends a thin ring out from the exact press point (the same wave the
 *   essay sheet makes), inside a clipping layer so the element's own
 *   overflow, shadows and edge light are left alone.
 *
 * With reduced motion the pressed state still shows but there's no ripple.
 */

/** Buttons get `btn-fx` from `buttonClasses`; mark other clickable surfaces `data-press`. */
export const PRESSABLE = ".btn-fx, [data-press]";

const MAX_RIPPLES = 3;

export function startPressEffects(): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let pressedEl: HTMLElement | null = null;

  const release = () => {
    if (pressedEl) delete pressedEl.dataset.pressed;
    pressedEl = null;
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.target instanceof Element ? (e.target.closest(PRESSABLE) as HTMLElement | null) : null;
    if (!el || el.matches(":disabled, [aria-disabled='true']")) return;
    release();
    pressedEl = el;
    el.dataset.pressed = "";
    if (reduce.matches) return;

    let host = el.querySelector<HTMLElement>(":scope > .press-fx");
    if (!host) {
      host = document.createElement("span");
      host.className = "press-fx";
      host.setAttribute("aria-hidden", "true");
      el.appendChild(host);
    }
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    // Big enough to reach the farthest corner from the press point.
    const size = 2 * Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
    const ripple = document.createElement("span");
    ripple.className = "press-ripple";
    // The ring's size animates up to --s, so its line stays 1px as it grows.
    ripple.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--s:${size.toFixed(0)}px`;
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    host.appendChild(ripple);
    while (host.childElementCount > MAX_RIPPLES) host.firstElementChild?.remove();
  };

  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", release, { passive: true });
  window.addEventListener("pointercancel", release, { passive: true });
  window.addEventListener("blur", release);
  return () => {
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
    window.removeEventListener("blur", release);
    release();
    document.querySelectorAll(".press-fx").forEach((n) => n.remove());
  };
}
