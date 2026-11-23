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
 * A finger that lands on a control is often starting a scroll, not a press.
 * So on touch the press shows once it is clearly a press: when the finger
 * lifts without having moved (a tap; well inside 0.2 s), or after a 0.15 s
 * hold that the browser has not turned into a scroll (the delay iOS scroll
 * views use). A scroll that starts on a button or card leaves it alone, and
 * if a held press turns into a scroll after all, its ring is taken back.
 *
 * With reduced motion the pressed state still shows but there's no ripple.
 */

/** Buttons get `btn-fx` from `buttonClasses`; mark other clickable surfaces `data-press`. */
export const PRESSABLE = ".btn-fx, [data-press]";

const MAX_RIPPLES = 3;
/** How long a still finger waits before the press shows (a tap shows at once on release). */
const HOLD_MS = 150;
/** Movement that makes a touch a drag/scroll rather than a press. */
const SLOP_PX = 10;
/** How long a tap's sunk state stays on, so the sink is seen. */
const TAP_SINK_MS = 130;

export function startPressEffects(): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let pressedEl: HTMLElement | null = null;
  let lastRipple: HTMLElement | null = null;
  let pending: { el: HTMLElement; id: number; x: number; y: number; timer: number } | null = null;
  let sinkTimer = 0;

  const release = () => {
    window.clearTimeout(sinkTimer);
    if (pressedEl) delete pressedEl.dataset.pressed;
    pressedEl = null;
  };
  const drop = () => {
    if (pending) window.clearTimeout(pending.timer);
    pending = null;
  };

  const press = (el: HTMLElement, clientX: number, clientY: number) => {
    release();
    pressedEl = el;
    el.dataset.pressed = "";
    lastRipple = null;
    if (reduce.matches) return;

    let host = el.querySelector<HTMLElement>(":scope > .press-fx");
    if (!host) {
      host = document.createElement("span");
      host.className = "press-fx";
      host.setAttribute("aria-hidden", "true");
      el.appendChild(host);
    }
    const r = el.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    // Big enough to reach the farthest corner from the press point.
    const size = 2 * Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
    const ripple = document.createElement("span");
    ripple.className = "press-ripple";
    // The ring's size animates up to --s, so its line stays 1px as it grows.
    ripple.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--s:${size.toFixed(0)}px`;
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    host.appendChild(ripple);
    lastRipple = ripple;
    while (host.childElementCount > MAX_RIPPLES) host.firstElementChild?.remove();
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.target instanceof Element ? (e.target.closest(PRESSABLE) as HTMLElement | null) : null;
    drop();
    if (!el || el.matches(":disabled, [aria-disabled='true']")) return;
    if (e.pointerType !== "touch") {
      press(el, e.clientX, e.clientY);
      return;
    }
    release();
    const { clientX: x, clientY: y, pointerId: id } = e;
    pending = {
      el,
      id,
      x,
      y,
      timer: window.setTimeout(() => {
        if (pending?.el !== el) return;
        pending = null;
        press(el, x, y);
      }, HOLD_MS),
    };
  };

  const onMove = (e: PointerEvent) => {
    if (pending && pending.id === e.pointerId && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > SLOP_PX) drop();
  };

  const onUp = (e: PointerEvent) => {
    if (pending && pending.id === e.pointerId) {
      // a tap: show the press now, and keep the sink on long enough to be seen
      const { el, x, y } = pending;
      drop();
      press(el, x, y);
      sinkTimer = window.setTimeout(release, TAP_SINK_MS);
      return;
    }
    release();
  };

  const onCancel = () => {
    drop();
    // a held press that the browser took for a scroll after all: take its ring back too
    if (pressedEl) lastRipple?.remove();
    release();
  };

  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("pointercancel", onCancel, { passive: true });
  window.addEventListener("blur", onCancel);
  return () => {
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("blur", onCancel);
    drop();
    release();
    document.querySelectorAll(".press-fx").forEach((n) => n.remove());
  };
}
