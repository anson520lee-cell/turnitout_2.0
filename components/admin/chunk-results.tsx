import type { SettingRow } from "@/lib/chunk-eval";
import { rates } from "@/lib/chunk-eval";

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

export function ChunkResults({ rows, minChars, eligible, total }: { rows: SettingRow[]; minChars: number; eligible: number; total: number }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Results</h2>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">
            Counting {eligible} of {total} samples (those with at least {minChars.toLocaleString("en-HK")} characters). Sentences rated High or Medium count as &ldquo;called&rdquo;.
          </p>
        </div>
        <form method="get" className="flex items-center gap-2 text-[12.5px] text-fg-muted">
          Only samples of at least
          <select name="min" defaultValue={String(minChars)} className="h-9 rounded-lg border border-[var(--line)] bg-ink-900/70 px-2 text-[13px] text-fg">
            {[0, 2000, 3000, 4000, 5000, 6000].map((n) => (
              <option key={n} value={n}>{n.toLocaleString("en-HK")} characters</option>
            ))}
          </select>
          <button type="submit" className="h-9 rounded-lg border border-[var(--line)] px-3 text-[13px] text-fg hover:bg-white/[0.05]">Apply</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-fg-muted">No runs yet. Load some samples below and press Start.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[12.5px] tabular-nums">
            <thead className="text-fg-subtle">
              <tr className="border-b border-[var(--line)]">
                <th className="py-2 pr-3 font-medium">Piece size</th>
                <th className="py-2 pr-3 font-medium">Setting</th>
                <th className="py-2 pr-3 font-medium">Pieces</th>
                <th className="py-2 pr-3 font-medium" title="Of the sentences that really are AI-written / Turnitin-flagged, how many were called">Caught</th>
                <th className="py-2 pr-3 font-medium" title="Of the sentences that are human-written / not flagged, how many were called by mistake">False alarms</th>
                <th className="py-2 pr-3 font-medium" title="Caught and not-falsely-alarmed averaged. 50% is chance, 100% is perfect">Overall score</th>
                <th className="py-2 pr-3 font-medium" title="Of the sentences called, how many were right">Called right</th>
                <th className="py-2 pr-3 font-medium">Human texts: false alarms</th>
                <th className="py-2 pr-3 font-medium">AI texts: caught</th>
                <th className="py-2 pr-3 font-medium">Seconds / piece</th>
                <th className="py-2 font-medium">Problems</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] text-fg-muted">
              {rows.map((r) => {
                const all = rates(r.all);
                const human = r.byOrigin.human ? rates(r.byOrigin.human) : null;
                const ai = r.byOrigin.ai ? rates(r.byOrigin.ai) : null;
                return (
                  <tr key={`${r.model}|${r.effort}|${r.size}`}>
                    <td className="py-2 pr-3 text-fg">{r.size.toLocaleString("en-HK")}</td>
                    <td className="py-2 pr-3">{r.model} · {r.effort} · {r.batches} run{r.batches === 1 ? "" : "s"}</td>
                    <td className="py-2 pr-3">{r.pieces}</td>
                    <td className="py-2 pr-3">{pct(all.recall)}</td>
                    <td className="py-2 pr-3">{pct(all.falseAlarmRate)}</td>
                    <td className="py-2 pr-3 text-fg">{pct(all.balanced)}</td>
                    <td className="py-2 pr-3">{pct(all.precision)}</td>
                    <td className="py-2 pr-3">{pct(human?.falseAlarmRate ?? null)}</td>
                    <td className="py-2 pr-3">{pct(ai?.recall ?? null)}</td>
                    <td className="py-2 pr-3">{Math.round(r.secondsPerPiece)}s</td>
                    <td className="py-2">{r.failed + r.cut ? <span className="text-warn">{r.failed} failed, {r.cut} cut off</span> : "none"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 space-y-1.5 border-t border-[var(--line)] pt-4 text-[12px] leading-relaxed text-fg-subtle">
        <p>How to read it:</p>
        <p>· <strong className="text-fg-muted">Overall score</strong> is the one to compare: the best piece size is where it is highest. Differences of a few points are noise; look for a range that is clearly above the others.</p>
        <p>· <strong className="text-fg-muted">Human texts: false alarms</strong> is how often a real person&rsquo;s sentence is wrongly called. Keep it low: a wrongly accused student is the worst outcome.</p>
        <p>· Run each size more than once (the model answers a little differently each time); the table pools every run of the same setting.</p>
        <p>· Texts shorter than the piece size are one piece at every size, so use the &ldquo;at least&rdquo; filter to compare sizes fairly.</p>
      </div>
    </div>
  );
}
