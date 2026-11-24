"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pencil, X } from "lucide-react";
import { mountRibbon } from "./manuscript-ribbon";
import styles from "./request-visuals.module.css";

const passages = [
  { line: "The city changed overnight.", note: "“Changed” makes a broad claim. What looked different the next morning?" },
  { line: "One window still held the light.", note: "The detail of one lit window gives the reader something specific to picture." },
  { line: "Inside, someone was setting the table.", note: "A small action brings the scene from the street into a single room." },
];
const lines = passages.map(p => p.line);
const pad = (n: number) => String(n + 1).padStart(2, "0");

export function ReportVisual({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const art = useRef<ReturnType<typeof mountRibbon>>(undefined);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const own = editing && draft.trim() !== "";
  const custom = own ? draft.trim() : "";
  useEffect(() => {
    if (!canvas.current) return;
    art.current = mountRibbon(canvas.current, lines);
    return () => art.current?.stop();
  }, []);
  useEffect(() => { art.current?.text(custom); }, [custom]);
  useEffect(() => { art.current?.select(index); }, [index]);

  return <section id="manuscript-study" aria-label="Interactive sample manuscript" className={`${className ?? ""} ${styles.study}`}>
    <header className={styles.head}><span><i aria-hidden="true"/>Sample manuscript</span>
      <button type="button" aria-expanded={editing} onClick={() => setEditing(!editing)}>
        {editing ? <X size={13}/> : <Pencil size={13}/>} {editing ? "Back to sample" : "Try your text"}
      </button>
    </header>
    <div className={styles.stage} onPointerMove={e => {
      if (e.pointerType !== "mouse") return;
      const box = e.currentTarget.getBoundingClientRect();
      art.current?.move((e.clientX - box.left) / box.width * 2 - 1, (e.clientY - box.top) / box.height * 2 - 1);
    }} onPointerLeave={() => art.current?.move(0,0)}
      onClick={e => {
        if (editing) return;
        const box = e.currentTarget.getBoundingClientRect();
        const part = Math.max(0, Math.min(2, Math.floor((e.clientX - box.left) / box.width * 3)));
        setIndex(part);
      }}>
      <div className={styles.glow}/><canvas ref={canvas} aria-hidden="true" className={styles.canvas}/>
      <div className={styles.ruler} aria-hidden="true"/>
      <div className={styles.markers} aria-hidden="true">{lines.map((line,i) =>
        <span key={line} data-active={!editing && i === index}>S·{pad(i)}</span>)}</div>
    </div>
    {editing ? <div className={styles.reading}>
      <label htmlFor="ribbon-sentence" className={styles.label}>Typeset your sentence</label>
      <input id="ribbon-sentence" className={styles.input} value={draft} maxLength={96} autoComplete="off"
        placeholder="Write a sentence…" onChange={e => setDraft(e.target.value)}/>
      <p className={styles.note}>Local typography preview · {draft.length}/96 characters</p>
    </div> : <div className={styles.reading}>
      <div className={styles.controls}><span className={styles.label}>Sentence {pad(index)} / 03</span>
        <div>{[-1,1].map(step => <button type="button" key={step} aria-label={step < 0 ? "Previous sentence" : "Next sentence"}
          onClick={() => setIndex((index + step + lines.length) % lines.length)}>
          {step < 0 ? <ArrowLeft size={15}/> : <ArrowRight size={15}/>}</button>)}</div>
      </div>
      <div key={index} aria-live="polite" className={styles.annotation}><p className={styles.quote}>{lines[index]}</p>
        <p className={styles.note}>{passages[index].note}</p></div>
    </div>}
  </section>;
}
