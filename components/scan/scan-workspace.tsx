"use client";
import Link from "next/link";
import { useCallback, useRef, useState, type DragEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ClipboardPaste, CornerDownLeft, FileUp, History, LogIn, PencilLine, RotateCcw, Sparkles } from "lucide-react";
import { runScan } from "@/app/actions/scan";
import type { AnalysisResult } from "@/lib/scanning/types";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { PasteDialog, type PasteResult } from "@/components/ui/paste-dialog";
import { ScanResult } from "./scan-result";
import { ScanVisual } from "./scan-visual";
import { QuickScan } from "./quick-scan";
import { QuickIntro } from "./quick-intro";
import { prefetchFeedback, useFeedbackProgress } from "./model-feedback";
import { higherLevel, verdictLevel } from "@/lib/report-format";
import { freeScan, retention } from "@/config/app";
import { countChars, cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { freeScanCharError } from "@/lib/orders/limits";
import { extractText, ExtractError } from "@/lib/extract-text";

/** What the visitor can do on /scan, decided on the server. */
export type ScanAccess = { mode: "account" | "guest"; remaining: number };

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

export function ScanWorkspace({ access }: { access: ScanAccess }) {
  const [guest, setGuest] = useState(access.mode === "guest");
  const [remaining, setRemaining] = useState(access.remaining);
  const [open, setOpen] = useState(false);
  const [dropped, setDropped] = useState<{ name: string; text: string } | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [feedback, setFeedback] = useState<{ ticket: string; text: string; previousText?: string; scanId?: string | null } | null>(null);
  // The last scanned text, so the student can edit it and re-check; recheck is on while that dialog is open.
  const [lastText, setLastText] = useState<string | null>(null);
  const [recheck, setRecheck] = useState(false);
  const [run, setRun] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // After Enter, a full-screen opening plays while the scan and the written review run behind it; then the quick
  // live scan replays the finished result; the report shows when that ends. "intro" until the data is in, then "scan".
  const [stage, setStage] = useState<"idle" | "intro" | "scan">("idle");
  const [pending, setPending] = useState<{ text: string; dataReady: boolean } | null>(null);
  const [retry, setRetry] = useState<{ text: string; message: string } | null>(null);
  const progress = useFeedbackProgress(feedback?.ticket ?? null);
  const live = stage !== "idle";

  const limitReached = remaining <= 0;
  const limitMessage = guest
    ? `You've used today's ${freeScan.dailyLimit} free scans. Sign in or come back tomorrow (it resets at midnight Hong Kong time).`
    : "You've used today's free scans. Your allowance resets at midnight Hong Kong time.";

  const openDialog = (from: "button" | "drop" | "again" | "recheck", file: { name: string; text: string } | null = null) => {
    if (limitReached) return;
    setRecheck(from === "recheck");
    setDropped(file);
    setDropError(null);
    setOpen(true);
    track("scan_dialog_opened", { from, guest });
  };

  const closeDialog = () => {
    setOpen(false);
    setDropped(null);
    setRecheck(false);
    setRetry(null);
  };

  const reveal = useCallback(() => {
    // After the dialog or the live scan has closed (and handed focus back), bring the report into view.
    setTimeout(() => {
      headingRef.current?.focus({ preventScroll: true });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      resultRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, 80);
  }, []);

  const validate = (text: string): string | null => {
    if (remaining <= 0) return limitMessage;
    if (recheck && lastText !== null && text.trim() === lastText.trim()) return "You haven’t changed anything yet. Edit the text, then press Enter.";
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

  // Enter: the dialog closes at once, the opening plays full screen, and the scan and the written review start
  // behind it. A failure (limit, server) brings the dialog back with the text still in it.
  const onSubmit = async (text: string): Promise<PasteResult> => {
    const previousText = recheck && lastText ? lastText : undefined;
    track(previousText ? "recheck_started" : "scan_started", { chars: countChars(text), guest });
    setRetry(null);
    setResult(null);
    setPending({ text, dataReady: false });
    setStage("intro");
    void (async () => {
      const res = await runScan(text).catch(() => ({ ok: false as const, code: "failed" as const, message: "We couldn't reach the server. Check your connection and try again." }));
      if (!res.ok) {
        if (res.code === "limit") {
          setRemaining(0);
          track("scan_limit_reached", { guest });
        }
        setStage("idle");
        setPending(null);
        setRetry({ text, message: res.message });
        setRecheck(Boolean(previousText));
        setOpen(true);
        return;
      }
      // The session may have changed since the page loaded (expired, or signed in elsewhere).
      setGuest(res.guest);
      setRemaining(res.remaining);
      setResult(res.result);
      setFeedback(res.feedbackTicket ? { ticket: res.feedbackTicket, text, previousText, scanId: res.scanId } : null);
      setLastText(text);
      setRun((n) => n + 1);
      if (res.feedbackTicket) prefetchFeedback(res.feedbackTicket, text, previousText);
      setPending({ text, dataReady: true });
      track("scan_completed", { risk: res.result.overallRisk, guest: res.guest });
    })();
    return { ok: true };
  };

  const startScan = useCallback(() => {
    if (result?.sentences?.length) setStage("scan");
    else {
      setStage("idle");
      reveal();
    }
  }, [result, reveal]);

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const description: ReactNode = (
    <>
      {dropped && (
        <span className="mb-1 block text-fg">
          Loaded &ldquo;{dropped.name}&rdquo;. Check the text, then press Enter.
        </span>
      )}
      {remaining} of {freeScan.dailyLimit} free scans left today{guest ? ", no account needed" : ""}. You get a quick AI-score range and the sentences that stand out.
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
              A quick AI-score range, the sentences that stand out, and readability.{" "}
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
        {result && !live && (
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
                {feedback && lastText && (
                  <Button variant="secondary" onClick={() => openDialog("recheck")} disabled={limitReached}>
                    <PencilLine className="size-4" /> Edit &amp; re-check
                  </Button>
                )}
                <Button variant="secondary" onClick={() => openDialog("again")} disabled={limitReached}>
                  <RotateCcw className="size-4" /> Scan another text
                </Button>
              </div>
            </div>
            <ScanResult result={result} feedback={feedback} verdictHint={progress.verdict} />
          </motion.section>
        )}
      </div>

      {stage === "intro" && pending && (
        <QuickIntro
          text={pending.text}
          dataReady={pending.dataReady}
          ready={pending.dataReady && (!feedback?.ticket || progress.settled)}
          onReady={startScan}
        />
      )}
      {stage === "scan" && result?.sentences && (
        <QuickScan
          key={run}
          sentences={result.sentences}
          level={higherLevel(result.overallRisk, progress.verdict ? verdictLevel[progress.verdict] : undefined)}
          onDone={() => {
            setStage("idle");
            reveal();
          }}
        />
      )}

      <PasteDialog
        open={open}
        onClose={closeDialog}
        title={recheck ? "Edit and re-check" : "Paste your paragraph(s)"}
        description={
          recheck ? (
            <>
              Change the sentences the report flagged, in your own words, then press Enter. The re-check only looks at what you changed. It uses one of today&rsquo;s scans ({remaining} left).
            </>
          ) : (
            description
          )
        }
        placeholder="Paste your writing here. Separate paragraphs with a blank line for paragraph-level signals."
        submitLabel={recheck ? "Re-check my edits" : "Scan my writing"}
        validate={validate}
        meta={meta}
        footnote={
          <>
            This is our own preliminary estimate, not a Turnitin result.{" "}
            <Link href="/services/screening" className="inline-flex items-center gap-0.5 text-accent hover:underline">
              Need the actual screening? <ArrowRight className="size-3" />
            </Link>
          </>
        }
        onSubmit={onSubmit}
        initialText={retry?.text ?? (recheck ? (lastText ?? undefined) : dropped?.text)}
        initialError={retry?.message}
        closeOnSuccess
      />
    </div>
  );
}
