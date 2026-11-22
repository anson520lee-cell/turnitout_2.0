"use client";
import { useEffect, useRef } from "react";
import {
  PLATE,
  drawManuscript,
  nearness,
  paperPalette,
  printInk,
  sentenceAt,
  typeset,
  type ManuscriptSentence,
} from "./manuscript-surface";
import { REST_LIFT, createField, stepField, timing, trackSpeed, type FieldInput } from "./manuscript-motion";
import styles from "./sentence-study.module.css";

type Props = {
  sentences: readonly ManuscriptSentence[];
  index: number;
  onInspect: (index: number) => void;
};

/** A finger that travels less than this is a tap, px. */
const TAP = 10;
/** A finger that travels this far sideways is reading along the lines, px. */
const SCRUB = 8;

export function Manuscript({ sentences, index, onInspect }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const selection = useRef(index);
  const readFromElsewhere = useRef<(() => void) | null>(null);

  // The chart, the keyboard or a link chose a sentence: raise it on the sheet.
  useEffect(() => {
    if (selection.current === index) return;
    selection.current = index;
    readFromElsewhere.current?.();
  }, [index]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const paper = typeset(sentences);
    const palette = paperPalette(canvas);
    if (Object.values(palette).some((color) => !color)) return;
    const plate = document.createElement("canvas");
    plate.width = PLATE.w;
    plate.height = PLATE.h;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const field = createField(sentences.length);
    const near = new Float32Array(sentences.length);
    const input: FieldInput = {
      hover: -1,
      inside: false,
      selected: selection.current,
      pinned: -1,
      focusUntil: 0,
      pressing: false,
      reduced: reduced.matches,
      near,
    };
    let w = 0,
      h = 0,
      frame = 0,
      last = 0,
      visible = false,
      introduced = false,
      printed = -1,
      shownProbe = -2,
      shownRisen = -2,
      lastMove = 0;
    let down: { x: number; y: number; type: string } | null = null;
    let scrubbing = false;

    function request() {
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(render);
    }
    function render(time: number) {
      frame = 0;
      if (!canvas || !ctx || !w || !h || !visible || document.hidden) return;
      const dt = Math.min(48, last ? time - last : 16);
      last = time;
      input.selected = selection.current;
      input.reduced = reduced.matches;
      if (input.hover >= 0) nearness(paper, w, h, field, near);
      const moving = stepField(field, input, dt);
      if (printed !== selection.current) {
        printed = selection.current;
        printInk(plate, paper, printed, palette);
        canvas.dataset.sentence = String(printed);
      }
      drawManuscript(ctx, w, h, paper, selection.current, field, palette, plate);
      canvas.dataset.ready = "true";
      // State for measuring: the sentence under the hairline, and the one that has risen.
      const probe = field.probeAlpha > 0.5 ? field.probe : -1;
      if (probe !== shownProbe) canvas.dataset.probe = String((shownProbe = probe));
      let risen = -1;
      for (let s = 0; s < field.lift.length; s++) {
        if (field.lift[s] >= 0.9 && (risen < 0 || field.lift[s] > field.lift[risen])) risen = s;
      }
      if (risen !== shownRisen) canvas.dataset.risen = String((shownRisen = risen));
      if (moving) request();
      else last = 0;
    }
    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
      request();
    }
    function local(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    }
    function inspect(next: number) {
      if (next < 0 || next === selection.current) return;
      selection.current = next;
      onInspect(next);
    }
    /** Follow a hovering mouse or pen, or a finger reading along the lines. */
    function follow(event: PointerEvent) {
      const p = local(event);
      if (input.inside && lastMove) {
        trackSpeed(field, p.x - field.x, (p.y - field.y) * (h / w), event.timeStamp - lastMove);
      } else {
        field.tailX = p.x;
        field.tailY = p.y;
      }
      lastMove = event.timeStamp;
      field.x = p.x;
      field.y = p.y;
      field.intro = -1;
      const hover = sentenceAt(paper, w, h, p.x, p.y, field, input.hover);
      const changed = hover !== input.hover || !input.inside;
      input.hover = hover;
      input.inside = true;
      if (input.pinned < 0) inspect(hover);
      if (!input.reduced || changed) request();
    }
    function move(event: PointerEvent) {
      if (event.pointerType !== "touch") return follow(event);
      if (!down || !event.isPrimary) return;
      if (!scrubbing && Math.abs(event.clientX - down.x) < SCRUB) return;
      scrubbing = true;
      follow(event);
    }
    function begin(event: PointerEvent) {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      down = { x: event.clientX, y: event.clientY, type: event.pointerType };
      field.intro = -1;
      if (event.pointerType === "touch") {
        // A finger leaves a drop of ink at once, before we know if it will tap or scroll.
        const p = local(event);
        field.tap = input.reduced ? -1 : 0;
        field.tapX = p.x;
        field.tapY = p.y;
        scrubbing = false;
      } else input.pressing = true;
      request();
    }
    function end(event: PointerEvent) {
      if (!down || !event.isPrimary) return;
      const tapped = Math.hypot(event.clientX - down.x, event.clientY - down.y) < TAP;
      const touch = down.type === "touch";
      down = null;
      input.pressing = false;
      if (touch && scrubbing) {
        scrubbing = false;
        input.hover = -1;
        input.inside = false;
        lastMove = 0;
      }
      if (!tapped) return request();
      const p = local(event);
      // A click takes the sentence the hairline is under: the press swells the
      // sheet, and the sentence must not change beneath a still pointer.
      const next = touch ? sentenceAt(paper, w, h, p.x, p.y, field) : input.hover;
      if (!input.reduced) {
        field.ring = 0;
        field.ringX = p.x;
        field.ringY = p.y;
      }
      if (touch) {
        // No hover on a phone: the tapped sentence rises at once and the light comes up under it.
        field.x = field.tailX = p.x;
        field.y = field.tailY = p.y;
        field.energy = Math.max(field.energy, 0.65);
        if (next >= 0) {
          inspect(next);
          input.focusUntil = input.reduced ? 0 : field.t + timing.read;
        }
      } else if (next < 0) input.pinned = -1;
      else {
        input.pinned = input.pinned === next ? -1 : next;
        inspect(next);
      }
      request();
    }
    function leave(event: PointerEvent) {
      if (event.pointerType === "touch" && event.type === "pointerleave") return;
      down = null;
      scrubbing = false;
      input.hover = -1;
      input.inside = false;
      input.pressing = false;
      input.pinned = -1;
      lastMove = 0;
      request();
    }
    function rest() {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      lastMove = 0;
      down = null;
      scrubbing = false;
      Object.assign(input, { hover: -1, inside: false, pressing: false, pinned: -1, focusUntil: 0 });
      field.lift.fill(0);
      field.hold.fill(0);
      if (!input.reduced) field.lift[selection.current] = REST_LIFT;
      field.energy = field.bend = field.press = field.speed = field.probeAlpha = 0;
      field.ring = field.tap = field.intro = -1;
      field.tailX = field.x;
      field.tailY = field.y;
    }
    function visibility() {
      if (!visible || document.hidden) return rest();
      // The first time the sheet comes into view, the reader's mark runs down the
      // sentences once, so the lines show they can be lifted.
      if (!introduced && !reduced.matches) field.intro = 0;
      introduced = true;
      request();
    }
    function motionPreference() {
      input.reduced = reduced.matches;
      if (input.reduced) rest();
      request();
    }
    readFromElsewhere.current = () => {
      input.focusUntil = input.reduced ? 0 : field.t + timing.read;
      input.pinned = -1;
      request();
    };
    const size = new ResizeObserver(resize);
    const viewport = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      visibility();
    });
    size.observe(canvas);
    viewport.observe(canvas);
    resize();
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", begin);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointercancel", leave);
    reduced.addEventListener("change", motionPreference);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      readFromElsewhere.current = null;
      cancelAnimationFrame(frame);
      size.disconnect();
      viewport.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", begin);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointercancel", leave);
      reduced.removeEventListener("change", motionPreference);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [sentences, onInspect]);

  return (
    <div className={styles.specimen} aria-hidden="true">
      <canvas ref={ref} />
      <div className={styles.paperFallback}>
        <b>Urban transport</b>
        <div>
          {sentences.map((s, i) => (
            <span key={i}>{s.text} </span>
          ))}
        </div>
      </div>
      <span className={styles.figureNumber}>
        S{String(index + 1).padStart(2, "0")} / {sentences.length}
      </span>
    </div>
  );
}
