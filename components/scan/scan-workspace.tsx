"use client";
import Link from "next/link";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ClipboardPaste, CornerDownLeft, FileUp, History, LogIn, RotateCcw, Sparkles } from "lucide-react";
import { runScan } from "@/app/actions/scan";
import type { AnalysisResult } from "@/lib/scanning/types";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { PasteDialog, type PasteResult } from "@/components/ui/paste-dialog";
import { ScanResult } from "./scan-result";
import { ScanVisual } from "./scan-visual";
import { freeScan, localModel, retention } from "@/config/app";
import { countChars, cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { freeScanCharError } from "@/lib/orders/limits";
import { extractText, ExtractError } from "@/lib/extract-text";

/** What the visitor can do on /scan, decided on the server. */
export type ScanAccess = { mode: "account" | "guest"; remaining: number };

const WAITING_STEPS = ["Segmenting sentences", "Measuring rhythm and structure", "Checking phrasing patterns", "Preparing your report"];

function UsageMeter({ remaining }: { remaining: number }) {
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: freeScan.dailyLimit }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 w-8 rounded-full transition-all duration-500",
              i < remaining ? "bg-gradient-to-r from-accent to-cyan shadow-[0_0_12px_rgb(91_140_255/0.75)]" : "bg-white/10",
            )}
          />
        ))}
      </div>
      <span className="text-[13px] text-fg-muted">
        <span className="font-medium text-fg">{remaining}</span> of {freeScan.dailyLimit} free scans left today
      </span>
    </div>
  );
}

function SignInLinks() {
  return (
    <div className="flex shrink-0 gap-2">
      <Link href="/login?next=/scan" className={buttonClasses("secondary", "sm")}>
        <LogIn className="size-3.5" /> Sign in
      </Link>
      <Link href="/signup" className={buttonClasses("ghost", "sm")}>
        Create account
      </Link>
    </div>
  );
}

export function ScanWorkspace({ access, modelFeedback = false }: { access: ScanAccess; modelFeedback?: boolean }) {
  const [guest, setGuest] = useState(access.mode === "guest");
  const [remaining, setRemaining] = useState(access.remaining);
  const [open, setOpen] = useState(false);
  const [dropped, setDropped] = useState<{ name: string; text: string } | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [feedbackJobId, setFeedbackJobId] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const revealPending = useRef(false);

  const limitReached = remaining <= 0;
  const limitMessage = guest
    ? `You've used today's ${freeScan.dailyLimit} free scans. Sign in or come back tomorrow (it resets at midnight Hong Kong time).`
    : "You've used today's free scans. Your allowance resets at midnight Hong Kong time.";

  const openDialog = (from: "button" | "drop" | "again", file: { name: string; text: string } | null = null) => {
    if (limitReached) return;
    setDropped(file);
    setDropError(null);
    setOpen(true);
    track("scan_dialog_opened", { from, guest });
  };

  const closeDialog = () => {
    setOpen(false);
    setDropped(null);
    if (!revealPending.current) return;
    revealPending.current = false;
    // After the dialog has closed (and handed focus back), bring the report into view.
    setTimeout(() => {
      headingRef.current?.focus({ preventScroll: true });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      resultRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, 80);
  };

  const validate = (text: string): string | null => {
    if (remaining <= 0) return limitMessage;
    return freeScanCharError(countChars(text));
  };

  const meta = (text: string): ReactNode => {
    const chars = countChars(text);
    return (
      <>
        <span className={cn(chars > 0 && chars < freeScan.minChars && "text-warn", chars > freeScan.maxChars && "text-risk")}>
          {chars.toLocaleString()} characters
        </span>
        {` · ${freeScan.minChars.toLocaleString()}–${freeScan.maxChars.toLocaleString()} per scan`}
      </>
    );
  };

  const onSubmit = async (text: string): Promise<PasteResult> => {
    track("scan_started", { chars: countChars(text), guest });
    const res = await runScan(text);
    if (!res.ok) {
      if (res.code === "limit") {
        setRemaining(0);
        track("scan_limit_reached", { guest });
      }
      return { ok: false, message: res.message };
    }
    // The session may have changed since the page loaded (expired, or signed in elsewhere).
    setGuest(res.guest);
    setRemaining(res.remaining);
    setResult(res.result);
    setFeedbackJobId(res.feedbackJobId);
    setRun((n) => n + 1);
    revealPending.current = true;
    track("scan_completed", { risk: res.result.overallRisk, guest: res.guest });
    return { ok: true };
  };

  const textNote =
    retention.storeScanText && !guest
      ? "Your text is saved with your scan history."
      : modelFeedback
        ? `Your text isn\u2019t stored. If our writing model is online, it also writes you feedback, and the text is deleted once the model has read it (within ${localModel.scanFeedbackMinutes} minutes).`
        : "Your text is analysed on our server and not stored.";

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const description: ReactNode = (
    <>
      {dropped && (
        <span className="mb-1 block text-fg">
          Loaded &ldquo;{dropped.name}&rdquo;. Check the text, then press Enter.
        </span>
      )}
      {remaining} of {freeScan.dailyLimit} free scans left today{guest ? ", no account needed" : ""}. We measure sentence rhythm, structure and phrasing patterns.
    </>
  );

  return (
    <div className="space-y-6">
      {guest && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 print:hidden sm:px-5">
          <p className="flex items-center gap-2.5 text-[13.5px] text-fg-muted">
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
              <Sparkles className="size-3.5" />
            </span>
            Free without an account: {freeScan.dailyLimit} scans a day. Sign in to keep your scan history.
          </p>
          <SignInLinks />
        </div>
      )}

      <Card
        strong
        tilt={4}
        className={cn(
          "noise overflow-hidden transition-[border-color,box-shadow] print:hidden",
          dragging && "border-accent/60 shadow-[0_0_0_4px_rgb(91_140_255/0.15)]",
        )}
        onDragOver={(e) => {
          if (!hasFiles(e) || limitReached) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e) || limitReached) return;
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (!file) return;
          // Read the file here in the browser; only its text goes to the dialog.
          extractText(file)
            .then((text) => openDialog("drop", { name: file.name, text }))
            .catch((err) => setDropError(err instanceof ExtractError ? err.message : "We couldn't read that file."));
        }}
      >
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-accent/15 blur-3xl" data-depth="-1" />
        <div className="relative grid items-center gap-6 p-6 sm:p-8 md:grid-cols-[1.1fr_0.9fr] lg:p-10">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Paste · Enter · Report</p>
            <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-[30px] sm:leading-[1.15]">
              Paste your paragraphs. <span className="text-gradient">Press Enter.</span> See what stands out.
            </h2>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-fg-muted">
              Sentence rhythm, structure, phrasing and readability, down to the sentences that drive the estimate.{" "}
              {freeScan.minChars.toLocaleString()}–{freeScan.maxChars.toLocaleString()} characters per scan.
            </p>
            <div className="mt-6">
              <UsageMeter remaining={remaining} />
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
              <span className="relative inline-flex">
                {!limitReached && (
                  <span
                    aria-hidden
                    className="absolute -inset-1.5 rounded-2xl bg-[linear-gradient(90deg,#5b8cff,#9a7bff,#5fd8f5,#5b8cff)] bg-[length:200%_100%] opacity-50 blur-lg animate-shimmer"
                  />
                )}
                <Button size="lg" onClick={() => openDialog("button")} disabled={limitReached} aria-haspopup="dialog">
                  <ClipboardPaste className="size-4.5" /> Paste text &amp; scan
                </Button>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-subtle">
                <FileUp className="size-3.5" /> or drop a .docx, .pdf or .txt here
              </span>
            </div>
            <p className="mt-4 hidden items-center gap-1.5 text-[12px] text-fg-subtle sm:flex">
              Then press
              <kbd className="inline-flex items-center gap-1 rounded-md border border-[var(--line-strong)] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-fg">
                Enter <CornerDownLeft className="size-3" />
              </kbd>
              to scan
            </p>
          </div>
          <ScanVisual level={result?.overallRisk} />
        </div>

        {dragging && (
          <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-accent/60 bg-ink-950/75 backdrop-blur-sm">
            <p className="flex items-center gap-2 text-[15px] font-medium">
              <FileUp className="size-4 text-accent" /> Drop to start a scan
            </p>
          </div>
        )}
      </Card>

      {dropError && (
        <div className="print:hidden">
          <FormMessage>{dropError}</FormMessage>
        </div>
      )}

      {limitReached && (
        <div className="print:hidden">
          <FormMessage tone="info">
            {limitMessage}{" "}
            {guest && (
              <>
                <Link className="underline" href="/login?next=/scan">Sign in</Link> to use your account&rsquo;s own allowance.{" "}
              </>
            )}
            Need a result now? <Link className="underline" href="/services/screening">Get a report</Link>.
          </FormMessage>
        </div>
      )}

      <div ref={resultRef} className="scroll-mt-24">
        {result && (
          <motion.section
            key={run}
            aria-labelledby="scan-report-title"
            initial={{ opacity: 0, y: 28, rotateX: 5 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
            style={{ transformPerspective: 1600, transformOrigin: "50% 0%" }}
          >
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden">
              <div>
                <h2 id="scan-report-title" ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight focus:outline-none">
                  Your report
                </h2>
                <p className="mt-1 text-[13px] text-fg-muted">
                  {guest ? (
                    <>Not saved: you scanned without an account. <Link href="/login?next=/scan" className="text-accent hover:underline">Sign in</Link> to keep a history.</>
                  ) : (
                    <>
                      Saved to your <Link href="/scan/history" className="text-accent hover:underline">scan history</Link>
                      {retention.storeScanText ? "." : " (scores only; the text isn\u2019t kept)."}
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!guest && (
                  <Link href="/scan/history" className={buttonClasses("ghost", "md")}>
                    <History className="size-4" /> History
                  </Link>
                )}
                <Button variant="secondary" onClick={() => openDialog("again")} disabled={limitReached}>
                  <RotateCcw className="size-4" /> Scan another text
                </Button>
              </div>
            </div>
            <ScanResult result={result} feedbackJobId={feedbackJobId} />
          </motion.section>
        )}
      </div>

      <p className="text-center text-[12.5px] text-fg-subtle print:hidden">
        {textNote}{" "}
        <Link href="/privacy" className={buttonClasses("ghost", "sm", "h-auto px-1 underline")}>Privacy</Link>
      </p>

      <PasteDialog
        open={open}
        onClose={closeDialog}
        title="Paste your paragraph(s)"
        description={description}
        placeholder="Paste your writing here. Separate paragraphs with a blank line for paragraph-level signals."
        submitLabel="Scan my writing"
        validate={validate}
        meta={meta}
        footnote={
          <>
            {textNote} This is our own preliminary estimate, not a Turnitin result.{" "}
            <Link href="/services/screening" className="inline-flex items-center gap-0.5 text-accent hover:underline">
              Need the actual screening? <ArrowRight className="size-3" />
            </Link>
          </>
        }
        onSubmit={onSubmit}
        initialText={dropped?.text}
        waitingTitle="Scanning your writing…"
        waitingSteps={WAITING_STEPS}
        waitingNote="This usually takes a few seconds. Please keep this window open."
        closeOnSuccess
      />
    </div>
  );
}
