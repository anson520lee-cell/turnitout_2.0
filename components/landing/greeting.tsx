"use client";
import { useEffect, useState } from "react";

/**
 * A line of welcome at the very top of the site, different on every visit.
 * None of them mention a time of day, so any of them fits whenever someone
 * arrives.
 *
 * The server sends an empty line of the same height; the greeting is chosen
 * in the browser (a random pick can't match between server and browser) and
 * fades in. It avoids showing the same one twice in a row.
 */
export const GREETINGS = [
  "Ready when you are.",
  "Welcome. The page is yours.",
  "Hello, wordsmith.",
  "A fresh pair of eyes, at your service.",
  "Every draft deserves a second look.",
  "Shall we take a look?",
  "Bring a draft. Leave with clarity.",
  "Your words, read with care.",
  "Let’s read between the lines.",
  "Calm, clear, and ready to scan.",
  "Good writing begins with an honest read.",
  "Hello, careful writer.",
  "Clarity is one scan away.",
  "Pull up a chair, and bring your draft.",
  "Know your draft before anyone else does.",
  "A quiet place to check your work.",
  "Paste a paragraph. See it plainly.",
  "Curious what your draft is saying?",
  "Let’s make sure it sounds like you.",
  "Nice to see you. What are we reading?",
];

const KEY = "greeting:last";

export function Greeting({ className }: { className?: string }) {
  const [text, setText] = useState<string | null>(null);

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

  return (
    <p className={`greeting flex min-h-[1.5em] items-center gap-2.5 ${className ?? ""}`} data-on={text ? "" : undefined}>
      <span aria-hidden className="greeting-mark">✦</span>
      <span>{text ?? " "}</span>
    </p>
  );
}
