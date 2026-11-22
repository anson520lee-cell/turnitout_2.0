"use client";
import { useEffect, useRef } from "react";
import {
  drawManuscript,
  paperPalette,
  printInk,
  restPose,
  sentenceAt,
  typeset,
  type ManuscriptSentence,
} from "./manuscript-surface";
import styles from "./sentence-study.module.css";

type Props = {
  sentences: readonly ManuscriptSentence[];
  index: number;
  onInspect: (index: number) => void;
};

export function Manuscript({ sentences, index, onInspect }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const selection = useRef(index);
  const invalidate = useRef<(() => void) | null>(null);

  useEffect(() => {
    selection.current = index;
    invalidate.current?.();
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
    plate.width = 1008;
    plate.height = 576;
    let printed = -1;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let w = 0,
      h = 0,
      frame = 0,
      last = 0,
      visible = false;
    let pointerX = 0.5,
      pointerY = 0.5,
      lift = 0,
      pinned = false;
    let press: { x: number; y: number } | null = null;
    const pose = { ...restPose };
    function request() {
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(render);
    }
    function render(time: number) {
      frame = 0;
      if (!canvas || !ctx || !w || !h || !visible || document.hidden) return;
      const dt = Math.min(48, last ? time - last : 16);
      last = time;
      if (reduced.matches) Object.assign(pose, restPose);
      else {
        const fast = 1 - Math.exp(-dt / 72),
          slow = 1 - Math.exp(-dt / 205);
        pose.x += (pointerX - pose.x) * fast;
        pose.y += (pointerY - pose.y) * fast;
        pose.tailX += (pointerX - pose.tailX) * slow;
        pose.tailY += (pointerY - pose.tailY) * slow;
        pose.lift += (lift - pose.lift) * (1 - Math.exp(-dt / (lift ? 115 : 200)));
        pose.pulse *= Math.exp(-dt / 265);
      }
      if (printed !== selection.current) {
        printed = selection.current;
        printInk(plate, paper, printed, palette);
      }
      drawManuscript(ctx, w, h, paper, selection.current, pose, palette, plate);
      canvas.dataset.ready = "true";
      const moving =
        Math.abs(pose.x - pointerX) +
        Math.abs(pose.y - pointerY) +
        Math.abs(pose.tailX - pointerX) +
        Math.abs(pose.tailY - pointerY) +
        Math.abs(pose.lift - lift) +
        pose.pulse;
      if (!reduced.matches && moving > 0.006) request();
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
    function point(event: PointerEvent) {
      if (!canvas) return -1;
      const rect = canvas.getBoundingClientRect();
      pointerX = (event.clientX - rect.left) / rect.width;
      pointerY = (event.clientY - rect.top) / rect.height;
      return sentenceAt(paper, w, h, pointerX, pointerY, pose);
    }
    function inspect(next: number) {
      if (next < 0 || next === selection.current) return;
      selection.current = next;
      onInspect(next);
    }
    function move(event: PointerEvent) {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const next = point(event);
      lift = 1;
      if (!pinned) inspect(next);
      request();
    }
    function begin(event: PointerEvent) {
      if (!event.isPrimary || event.button !== 0) return;
      press = { x: event.clientX, y: event.clientY };
    }
    function end(event: PointerEvent) {
      if (!press || !event.isPrimary) return;
      const tapped = Math.hypot(event.clientX - press.x, event.clientY - press.y) < 10;
      press = null;
      if (!tapped) return;
      const next = point(event);
      if (next < 0) return;
      pinned = !pinned || next !== selection.current;
      inspect(next);
      pose.pulse = 1;
      request();
    }
    function leave() {
      lift = 0;
      pinned = false;
      press = null;
      request();
    }
    function visibility() {
      if (!visible || document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
        lift = 0;
        Object.assign(pose, restPose);
      } else request();
    }
    const size = new ResizeObserver(resize);
    const viewport = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      visibility();
    });
    size.observe(canvas);
    viewport.observe(canvas);
    resize();
    invalidate.current = request;
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", begin);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointercancel", leave);
    reduced.addEventListener("change", request);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      invalidate.current = null;
      cancelAnimationFrame(frame);
      size.disconnect();
      viewport.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", begin);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointercancel", leave);
      reduced.removeEventListener("change", request);
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
