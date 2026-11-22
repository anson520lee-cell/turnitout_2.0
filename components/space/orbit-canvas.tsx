"use client";
import { useEffect, useRef } from "react";
import { mountOrbit, type OrbitForm } from "./orbit-renderer";

interface Props {
  form: OrbitForm;
  compact?: boolean;
  paused?: boolean;
  onAdvance?: () => void;
  label?: string;
}

/** A decorative signature in the page mastheads, a keyboard-operable model on the homepage. */
export function OrbitCanvas({ form, compact = false, paused = false, onAdvance, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ReturnType<typeof mountOrbit>>(null);
  const initial = useRef(form);
  const interactive = !!onAdvance;
  useEffect(() => {
    if (!ref.current) return;
    engine.current = mountOrbit(ref.current, initial.current, interactive);
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
  }, [interactive]);
  useEffect(() => {
    engine.current?.setForm(form);
  }, [form]);
  useEffect(() => {
    engine.current?.setPaused(paused);
  }, [paused]);
  const content = <canvas ref={ref} aria-hidden />;
  const className = compact ? "orbit-canvas orbit-compact" : "orbit-canvas";
  if (!onAdvance)
    return (
      <div className={className} data-form={form} aria-hidden>
        {content}
      </div>
    );
  return (
    <button
      type="button"
      className={className}
      data-form={form}
      aria-label={label}
      onClick={(event) => {
        if (!event.detail || !engine.current?.consumedDrag()) onAdvance();
      }}
    >
      {content}
    </button>
  );
}
