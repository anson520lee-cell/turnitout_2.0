"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { WaitingAnimation } from "@/components/ui/waiting";
import { extractText, ExtractError, SCAN_FILE_ACCEPT } from "@/lib/extract-text";
import { cn } from "@/lib/utils";

export type PasteResult = { ok: true } | { ok: false; message: string };

/**
 * The paste-and-press-Enter flow shared by the free scan, report requests and
 * writing review: a modal with one big text box. Enter submits (Shift+Enter
 * adds a line; Enter while an IME is composing is ignored, so Chinese input
 * works), then the dialog switches to a "please wait" animation until
 * `onSubmit` resolves. On success the caller decides what happens next
 * (close, navigate); the waiting state stays up until it does.
 */
export function PasteDialog({
  open,
  onClose,
  title,
  description,
  placeholder = "Paste your paragraph(s) here…",
  submitLabel = "Submit",
  validate,
  meta,
  footnote,
  onSubmit,
  waitingTitle = "Please wait…",
  waitingSteps = ["Working on it"],
  waitingNote = "This usually takes a few seconds. Please keep this window open.",
  allowFile = true,
  closeOnSuccess = false,
  initialText,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  placeholder?: string;
  submitLabel?: string;
  /** Return an error message to block submission, or null. */
  validate?: (text: string) => string | null;
  /** Live line under the text box: counts, price, limits. */
  meta?: (text: string) => ReactNode;
  footnote?: ReactNode;
  onSubmit: (text: string) => Promise<PasteResult>;
  waitingTitle?: string;
  waitingSteps?: string[];
  waitingNote?: string;
  allowFile?: boolean;
  closeOnSuccess?: boolean;
  /** Text to fill the box with when the dialog opens (e.g. from a dropped file). */
  initialText?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"edit" | "reading" | "waiting">("edit");
  const titleId = useId();

  // Fill the box from `initialText` once per opening (adjust-state-during-render,
  // so the dropped file's text is there on the first painted frame).
  const [appliedInitial, setAppliedInitial] = useState<string | undefined>(undefined);
  if (open && initialText && initialText !== appliedInitial) {
    setAppliedInitial(initialText);
    setText(initialText);
  } else if (!open && appliedInitial !== undefined) {
    setAppliedInitial(undefined);
  }

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setPhase("edit");
      setError(null);
      requestAnimationFrame(() => textRef.current?.focus());
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const busy = phase !== "edit";

  const submit = async () => {
    if (busy) return;
    const value = text.trim();
    const problem = !value ? "Paste some text first." : validate?.(value) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setPhase("waiting");
    let res: PasteResult;
    try {
      res = await onSubmit(value);
    } catch {
      res = { ok: false, message: "We couldn't reach the server. Check your connection and try again." };
    }
    if (!res.ok) {
      setPhase("edit");
      setError(res.message);
      requestAnimationFrame(() => textRef.current?.focus());
      return;
    }
    if (closeOnSuccess) {
      setText("");
      onClose();
    }
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setPhase("reading");
    setError(null);
    try {
      setText(await extractText(file));
    } catch (e) {
      setError(e instanceof ExtractError ? e.message : "We couldn't read that file.");
    } finally {
      setPhase("edit");
      if (fileRef.current) fileRef.current.value = "";
      requestAnimationFrame(() => textRef.current?.focus());
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Escape: don't abandon a request that's already running.
        e.preventDefault();
        if (phase !== "waiting") onClose();
      }}
      onClose={() => {
        // The browser can close a modal by itself (e.g. Chrome lets a second
        // Escape through even while we block the first). Tell the parent, so
        // its `open` state and the button that opens the dialog stay in sync.
        if (open) onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && phase !== "waiting") onClose();
      }}
      // Scrolls as a whole on short screens (small phones, on-screen keyboard
      // open) so the footnote and the submit button are always reachable.
      className="m-auto max-h-[calc(100dvh-16px)] w-[min(760px,calc(100vw-24px))] max-w-none overflow-y-auto overscroll-contain bg-transparent p-0 text-fg backdrop:bg-ink-950/70 backdrop:backdrop-blur-md"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, rotateX: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            style={{ transformPerspective: 1200 }}
            className="glass-strong no-cursor-light noise relative overflow-hidden rounded-3xl"
          >
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative flex items-start justify-between gap-4 px-5 pt-5 sm:px-7 sm:pt-6">
              <div>
                <h2 id={titleId} className="text-[18px] font-semibold tracking-tight">{title}</h2>
                {description && <div className="mt-1 text-[13px] text-fg-muted">{description}</div>}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={phase === "waiting"}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-subtle transition hover:bg-white/[0.06] hover:text-fg disabled:opacity-30"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="relative px-5 pb-5 pt-4 sm:px-7 sm:pb-7">
              {phase === "waiting" ? (
                <WaitingAnimation title={waitingTitle} steps={waitingSteps} note={waitingNote} />
              ) : (
                <>
                  <label htmlFor={`${titleId}-text`} className="sr-only">Text</label>
                  <div className="paste-input-frame rounded-2xl">
                    <textarea
                      id={`${titleId}-text`}
                      ref={textRef}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        // keyCode 229: Safari fires the Enter that confirms an IME
                        // candidate (Cangjie, Pinyin…) after compositionend.
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
                          e.preventDefault();
                          submit();
                        }
                      }}
                      placeholder={placeholder}
                      disabled={busy}
                      aria-invalid={Boolean(error) || undefined}
                      className="block h-[min(40dvh,380px)] w-full resize-none rounded-2xl border border-[var(--line)] bg-ink-900/90 px-4 py-4 font-serif text-[15.5px] leading-[1.8] text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.03)] placeholder:font-sans placeholder:text-[14px] placeholder:text-fg-subtle focus:border-accent/60 focus:outline-none focus:ring-4 focus:ring-accent/15"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[12px] text-fg-subtle">
                    <span>{meta?.(text)}</span>
                    {allowFile && (
                      <>
                        <input
                          ref={fileRef}
                          type="file"
                          accept={SCAN_FILE_ACCEPT}
                          className="sr-only"
                          tabIndex={-1}
                          aria-hidden
                          onChange={(e) => loadFile(e.target.files?.[0])}
                        />
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 font-sans text-[12.5px] text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                        >
                          <FileUp className="size-3.5" /> {phase === "reading" ? "Reading file…" : "Or load a .docx, .pdf or .txt"}
                        </button>
                      </>
                    )}
                  </div>
                  <div className="mt-3">
                    <FormMessage>{error}</FormMessage>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-[12.5px] text-fg-muted">
                      <kbd className="inline-flex items-center gap-1 rounded-md border border-[var(--line-strong)] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-fg">
                        Enter <CornerDownLeft className="size-3" />
                      </kbd>
                      to submit
                      <span className="text-fg-subtle">· Shift + Enter for a new line</span>
                    </p>
                    <Button type="button" onClick={submit} disabled={busy} size="md">
                      {submitLabel}
                    </Button>
                  </div>
                  {footnote && <div className={cn("mt-4 border-t border-[var(--line)] pt-3 text-[11.5px] leading-relaxed text-fg-subtle")}>{footnote}</div>}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
