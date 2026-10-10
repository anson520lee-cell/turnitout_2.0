"use client";
import { useMemo, useState } from "react";
import type { SentenceSignal } from "@/lib/scanning/types";
import { Card } from "@/components/ui/card";
import { HudCorners, HudLabel } from "@/components/ui/hud";
import { cn } from "@/lib/utils";

const mark = {
  elevated: "bg-risk/[0.22] decoration-risk/80 hover:bg-risk/30",
  moderate: "bg-warn/[0.16] decoration-warn/70 hover:bg-warn/25",
  low: "hover:bg-white/[0.04]",
} as const;

/**
 * The user's text with each sentence tinted by the patterns found in it.
 * Clicking (or focusing) a sentence shows why it was flagged.
 */
export function SentenceHighlights({ sentences }: { sentences: SentenceSignal[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const paragraphs = useMemo(() => {
    const out: { s: SentenceSignal; i: number }[][] = [];
    sentences.forEach((s, i) => (out[s.paragraph] ??= []).push({ s, i }));
    return out.filter(Boolean);
  }, [sentences]);

  const counts = useMemo(
    () => ({
      elevated: sentences.filter((s) => s.level === "elevated").length,
      moderate: sentences.filter((s) => s.level === "moderate").length,
    }),
    [sentences],
  );

  const current = selected === null ? null : sentences[selected];

  return (
    <Card className="p-5 sm:p-6">
      <HudCorners />
      <HudLabel className="mb-2">Sentence scan</HudLabel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Sentence highlights</h2>
          <p className="mt-1 text-[12.5px] text-fg-subtle">
            Select a sentence to see which patterns it contains. Shown only now; your text isn&rsquo;t saved.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-fg-muted print:hidden">
          <input
            type="checkbox"
            className="accent-[var(--color-accent)]"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
          />
          Dim unflagged sentences
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-[12px] text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-risk/60" /> Several patterns · {counts.elevated}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-warn/60" /> One pattern · {counts.moderate}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-white/15" /> None found · {sentences.length - counts.elevated - counts.moderate}
        </span>
      </div>

      <div className="mt-4 max-h-[520px] space-y-4 overflow-y-auto rounded-xl border border-[var(--line)] bg-ink-900/50 p-4 font-serif text-[15px] leading-[1.9] text-fg sm:p-5 print:max-h-none print:overflow-visible">
        {paragraphs.map((para, pi) => (
          <p key={pi}>
            {para.map(({ s, i }) => (
              <span key={i}>
                <span
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === i}
                  aria-label={s.reasons.length ? `Sentence ${i + 1}: ${s.reasons.join("; ")}` : undefined}
                  onClick={() => setSelected(selected === i ? null : i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(selected === i ? null : i);
                    }
                  }}
                  className={cn(
                    "cursor-pointer rounded-[4px] px-0.5 decoration-2 underline-offset-4 transition-colors",
                    s.level !== "low" && "underline",
                    mark[s.level],
                    selected === i && "ring-1 ring-accent/70",
                    onlyFlagged && s.level === "low" && "opacity-35",
                  )}
                >
                  {s.text}
                </span>{" "}
              </span>
            ))}
          </p>
        ))}
      </div>

      <div className="mt-3 min-h-[52px] rounded-xl border border-[var(--line)] bg-white/[0.02] px-4 py-3 text-[13px] print:hidden" aria-live="polite">
        {current ? (
          current.reasons.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {current.reasons.map((r) => (
                <li key={r} className="rounded-md bg-white/[0.06] px-2 py-0.5 text-fg-muted">{r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted">No patterns found in this sentence.</p>
          )
        ) : (
          <p className="text-fg-subtle">Highlights mark regular patterns, not authorship. Plenty of human writing is flagged here.</p>
        )}
      </div>
    </Card>
  );
}
