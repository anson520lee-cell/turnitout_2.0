"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardPaste, Eraser, ScanText } from "lucide-react";
import { runScan } from "@/app/actions/scan";
import type { AnalysisResult } from "@/lib/scanning/types";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { ScanResult } from "./scan-result";
import { freeScan, retention } from "@/config/app";
import { countWords, cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

function UsageMeter({ remaining }: { remaining: number }) {
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: freeScan.dailyLimit }).map((_, i) => (
          <span key={i} className={cn("h-1.5 w-6 rounded-full", i < remaining ? "bg-accent shadow-[0_0_8px_rgb(91_140_255/0.7)]" : "bg-white/10")} />
        ))}
      </div>
      <span className="text-[13px] text-fg-muted">
        <span className="font-medium text-fg">{remaining}</span> of {freeScan.dailyLimit} free scans remaining today
      </span>
    </div>
  );
}

const PHASES = ["Segmenting sentences", "Measuring rhythm and structure", "Checking phrasing patterns", "Preparing signals"];

export function ScanWorkspace({ initialRemaining }: { initialRemaining: number }) {
  const [text, setText] = useState("");
  const [remaining, setRemaining] = useState(initialRemaining);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  const words = countWords(text);
  const chars = text.length;
  const tooShort = words > 0 && words < freeScan.minWords;
  const tooLong = words > freeScan.maxWords || chars > freeScan.maxChars;
  const limitReached = remaining <= 0;

  const submit = () => {
    setError(null);
    if (!text.trim()) return setError({ code: "invalid", message: "Paste some text to scan." });
    if (tooShort) return setError({ code: "invalid", message: `Add a little more text. The scan needs at least ${freeScan.minWords} words.` });
    if (tooLong) return setError({ code: "invalid", message: `The free scan handles up to ${freeScan.maxWords.toLocaleString()} words at a time.` });
    track("scan_started", { words });
    setPhase(0);
    const iv = setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 1)), 450);
    start(async () => {
      try {
        const res = await runScan(text);
        if (res.ok) {
          setResult(res.result);
          setRemaining(res.remaining);
          track("scan_completed", { risk: res.result.overallRisk });
          setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        } else {
          if (res.code === "limit") {
            setRemaining(0);
            track("scan_limit_reached");
          }
          setError({ code: res.code, message: res.message });
        }
      } catch {
        setError({ code: "network", message: "We couldn't reach the server. Check your connection and try again. This scan wasn't counted." });
      } finally {
        clearInterval(iv);
      }
    });
  };

  return (
    <div className="space-y-8">
      <Card strong className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
          <UsageMeter remaining={remaining} />
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={async () => {
                try {
                  const t = await navigator.clipboard.readText();
                  setText((prev) => (prev ? `${prev}\n\n${t}` : t));
                } catch {
                  setError({ code: "clipboard", message: "Your browser blocked clipboard access. Paste with Ctrl/Cmd + V instead." });
                }
              }}
            >
              <ClipboardPaste className="size-3.5" /> Paste
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => { setText(""); setResult(null); setError(null); }} disabled={!text}>
              <Eraser className="size-3.5" /> Clear
            </Button>
          </div>
        </div>
        <label htmlFor="scan-text" className="sr-only">Text to scan</label>
        <textarea
          id="scan-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your writing here. Separate paragraphs with a blank line for paragraph-level signals."
          className="block min-h-[340px] w-full resize-y bg-transparent px-5 py-5 font-serif text-[16px] leading-[1.8] text-fg placeholder:font-sans placeholder:text-[14px] placeholder:text-fg-subtle focus:outline-none sm:px-6"
          aria-invalid={tooLong || undefined}
          aria-describedby="scan-counts"
          disabled={pending}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 sm:px-5">
          <p id="scan-counts" className="font-mono text-[12px] text-fg-subtle">
            <span className={cn(tooShort && "text-warn", tooLong && "text-risk")}>{words.toLocaleString()} words</span>
            {" · "}
            {chars.toLocaleString()} characters
            {tooShort && ` · minimum ${freeScan.minWords}`}
          </p>
          <Button onClick={submit} loading={pending} disabled={limitReached || !text.trim()} size="md">
            {!pending && <ScanText className="size-4" />}
            {pending ? PHASES[phase] : "Run preliminary scan"}
          </Button>
        </div>
      </Card>

      {error && (
        <FormMessage tone={error.code === "limit" ? "info" : "error"}>
          {error.message}{" "}
          {error.code === "limit" && (
            <>
              Need a result today? <Link className="underline" href="/services/screening">Request a screening</Link>.
            </>
          )}
          {error.code === "unauthenticated" && <Link className="underline" href="/login?next=/scan">Sign in</Link>}
        </FormMessage>
      )}
      {limitReached && !error && (
        <FormMessage tone="info">
          You&rsquo;ve used today&rsquo;s free scans. Your allowance resets at midnight Hong Kong time.{" "}
          <Link className="underline" href="/services/screening">Request a screening</Link> if you need a result now.
        </FormMessage>
      )}

      <AnimatePresence>
        {pending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-5 lg:grid-cols-[1fr_1.35fr]" aria-hidden>
            <div className="skeleton h-72" />
            <div className="skeleton h-72" />
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={resultRef} className="scroll-mt-24">
        {result && !pending && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <ScanResult result={result} />
          </motion.div>
        )}
      </div>
      {!result && !pending && (
        <p className="text-center text-[12.5px] text-fg-subtle">
          {retention.storeScanText ? "Your text is saved with your scan history." : "Your text is analysed on our server and not stored."} <Link href="/privacy" className={buttonClasses("ghost", "sm", "h-auto px-1 underline")}>Privacy</Link>
        </p>
      )}
    </div>
  );
}
