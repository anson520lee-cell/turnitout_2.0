import type { Readability } from "@/lib/scanning/types";
import { Card } from "@/components/ui/card";

function easeLabel(score: number) {
  if (score >= 70) return "Easy to read";
  if (score >= 50) return "Fairly standard";
  if (score >= 30) return "Academic";
  return "Very dense";
}

/** Flesch scores and sentence length. These describe clarity, not AI risk. */
export function ReadabilityCard({ r }: { r: Readability }) {
  const stats: [string, string, string?][] = [
    ["Reading ease", r.readingEase === null ? "—" : String(r.readingEase), r.readingEase === null ? "English text only" : easeLabel(r.readingEase)],
    ["Grade level", r.gradeLevel === null ? "—" : r.gradeLevel.toFixed(1), "Flesch–Kincaid"],
    ["Words per sentence", r.avgSentenceWords.toFixed(1), "average"],
    ["Long sentences", String(r.longSentences), "over 35 words"],
    ["Reading time", `${r.readingMinutes} min`, "at 238 wpm"],
  ];
  return (
    <Card tilt={3} className="p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Readability</h2>
        <span className="text-[12px] text-fg-subtle">Clarity measures, separate from the risk estimate</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {stats.map(([k, v, hint]) => (
          <div key={k} className="rounded-xl border border-[var(--line)] bg-ink-900/50 px-3 py-3">
            <dt className="text-[11.5px] text-fg-subtle">{k}</dt>
            <dd className="mt-1 text-[20px] font-semibold tracking-tight">{v}</dd>
            {hint && <dd className="text-[11px] text-fg-subtle">{hint}</dd>}
          </div>
        ))}
      </dl>
      {r.readingEase !== null && (
        <div className="mt-4" aria-hidden>
          <div className="relative h-1.5 rounded-full bg-gradient-to-r from-risk/70 via-warn/70 to-ok/70">
            <span
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-950 bg-fg shadow-[0_0_10px_rgb(255_255_255/0.6)]"
              style={{ left: `${r.readingEase}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] text-fg-subtle">
            <span>Dense</span>
            <span>Easy</span>
          </div>
        </div>
      )}
    </Card>
  );
}
