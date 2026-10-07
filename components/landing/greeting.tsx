"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { playCloud } from "@/components/motion/entrance-engine";

/**
 * An everyday greeting at the very top of the site, different on every visit:
 * just how you would greet someone, with no pitch for the site. None of them
 * mention a time of day, so any of them fits whenever someone arrives.
 *
 * It is set large, sized so the line spans about two thirds of the window, and
 * dissolves into the headline below as the page scrolls (entrance-engine.ts).
 *
 * The server sends an empty line of the same height; the greeting is chosen
 * in the browser (a random pick can't match between server and browser) and
 * assembles from a particle cloud. It avoids showing the same one twice in a row.
 */
export const GREETINGS = [
  "Feeling well?",
  "How are you today?",
  "How’s your day going?",
  "Hey, how are you?",
  "Long time no see.",
  "How have you been?",
  "What’s new with you?",
  "Doing alright?",
  "Nice to see you.",
  "How’s everything?",
  "Had something to eat yet?",
  "How’s it going?",
  "Good to have you back.",
  "Hope you’re doing well.",
  "Everything okay?",
  "How was your week?",
  "Hey there, stranger.",
  "Taking it easy today?",
  "How are you feeling?",
  "Got a minute?",
];

const KEY = "greeting:last";

export function Greeting({ className }: { className?: string }) {
  const [text, setText] = useState<string | null>(null);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let last = -1;
    try {
      last = Number(window.sessionStorage.getItem(KEY) ?? -1);
    } catch {
      // storage can be unavailable (private mode); a repeat is harmless
    }
    let i = Math.floor(Math.random() * GREETINGS.length);
    if (i === last) i = (i + 1 + Math.floor(Math.random() * (GREETINGS.length - 1))) % GREETINGS.length;
    try {
      window.sessionStorage.setItem(KEY, String(i));
    } catch {
      // see above
    }
    setText(GREETINGS[i]);
  }, []);

  // size the line to about two thirds of the window, then let the cloud build it, before paint
  useLayoutEffect(() => {
    const el = ref.current;
    if (!text || !el) return;
    const fit = () => {
      const small = window.innerWidth < 640;
      const want = window.innerWidth * (small ? 0.86 : 0.66);
      el.style.fontSize = "100px";
      const w = el.scrollWidth || 1;
      const size = Math.min((100 * want) / w, window.innerHeight * 0.3);
      el.style.fontSize = `${Math.max(size, 26)}px`;
    };
    fit();
    playCloud(el, 250);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [text]);

  return (
    <p ref={ref} className={`greeting flex min-h-[1.5em] items-center justify-center gap-[0.35em] whitespace-nowrap ${className ?? ""}`}>
      <span aria-hidden className="greeting-mark">✦</span>
      <span>{text ?? " "}</span>
    </p>
  );
}
