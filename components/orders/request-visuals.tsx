"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { mountInference } from "./inference-field";
import styles from "./request-visuals.module.css";

export function ReportVisual({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const field = useRef<ReturnType<typeof mountInference>>(undefined);
  const [output, setOutput] = useState(0);
  const [input, setInput] = useState(46);
  const [streaming, setStreaming] = useState(false);
  const activePointer = useRef<number | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    field.current = mountInference(canvas.current, setOutput);
    return () => field.current?.stop();
  }, []);
  function steer(value: number) {
    const next = Math.round(Math.max(0, Math.min(100, value)));
    setInput(next);
    field.current?.steer(next / 100);
  }
  function steerAt(y: number, element: HTMLElement) {
    const box = element.getBoundingClientRect();
    steer((y - box.top) / box.height * 100);
  }
  function release(pointerId: number) {
    if (activePointer.current !== pointerId) return;
    activePointer.current = null;
    setStreaming(false);
    field.current?.hold(false);
  }
  return <section id="inference-field" className={`${className ?? ""} ${styles.field}`} aria-label="Interactive inference demo">
    <header className={styles.head}>
      <h2>Inference engine</h2>
      <span className={styles.demo}><i aria-hidden="true" />Interactive demo</span>
    </header>
    <div className={styles.stage} data-streaming={streaming}
      onPointerDown={e => {
        if (activePointer.current !== null || e.button !== 0) return;
        activePointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        steerAt(e.clientY, e.currentTarget);
        setStreaming(true);
        field.current?.hold(true);
      }}
      onPointerMove={e => {
        if (activePointer.current === e.pointerId) steerAt(e.clientY, e.currentTarget);
      }}
      onPointerUp={e => release(e.pointerId)} onPointerCancel={e => release(e.pointerId)}
      onLostPointerCapture={e => release(e.pointerId)}>
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
      <div className={styles.axis} aria-hidden="true">
        <span>Input</span><span>Hidden layers</span><span>Output</span>
      </div>
    </div>
    <footer className={styles.footer}>
      <div className={styles.actions}>
        <div className={styles.cta}>
          <button type="button" onClick={() => field.current?.send()}>Send pulse <ArrowRight size={15} aria-hidden="true" /></button>
          <span className={styles.tally} aria-label={`${output} pulses received at output`}>
            <i aria-hidden="true" />RX <b>{String(output).padStart(3,"0")}</b>
          </span>
        </div>
        <label className={styles.inputControl}>Input position
          <input type="range" min="0" max="100" step="1" value={input} onChange={e => steer(Number(e.target.value))} />
        </label>
      </div>
      <p>Hold the field to stream pulses. Drag up or down to steer.</p>
    </footer>
  </section>;
}
