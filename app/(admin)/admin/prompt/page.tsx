import type { Metadata } from "next";
import { assertAdmin } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PromptEditor } from "@/components/admin/prompt-editor";
import { ModelPicker } from "@/components/admin/model-picker";
import { MODEL_CHOICES, getModelSetting, getScanReportSetting, listPromptVersions } from "@/lib/site-settings";
import { usageSummary } from "@/lib/model-usage";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · AI prompt" };
// The test run on this page waits for the model.
export const maxDuration = 120;

const usd = (n: number) => (n < 0.01 && n > 0 ? "< $0.01" : `$${n.toFixed(2)}`);
const num = (n: number) => n.toLocaleString("en-HK");

export default async function AdminPrompt() {
  await assertAdmin();
  const [setting, model, versions, usage] = await Promise.all([
    getScanReportSetting(),
    getModelSetting(),
    listPromptVersions(),
    usageSummary(14),
  ]);
  const preview = (v: string) => v.replace(/\s+/g, " ").slice(0, 140);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">AI prompt</h1>
      <p className="mt-1 max-w-3xl text-[13px] text-fg-muted">
        What DeepSeek is told with every free scan, and which model runs it. Changes take effect on new scans within about 30 seconds; no redeploy needed.
      </p>

      <div className="mt-6 space-y-5">
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-semibold">Model and reasoning</h2>
            {model.customModel || model.customEffort ? <Badge tone="success">Set here</Badge> : <Badge>Default</Badge>}
          </div>
          <ModelPicker choices={MODEL_CHOICES} model={model.model} effort={model.effort} custom={model.customModel || model.customEffort} />
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
            <h2 className="mr-1 text-[14px] font-semibold text-fg">System prompt</h2>
            {setting.custom ? <Badge tone="success">Your prompt</Badge> : <Badge>Built-in prompt</Badge>}
            {setting.updatedAt && <span>Last saved {formatDateTime(setting.updatedAt)}</span>}
          </div>
          <PromptEditor
            initial={setting.value}
            custom={setting.custom}
            versions={versions.map((v) => ({ id: v.id, savedAt: v.savedAt, preview: preview(v.value) }))}
          />
          <div className="mt-5 space-y-1.5 border-t border-[var(--line)] pt-4 text-[12px] leading-relaxed text-fg-subtle">
            <p>Tips for the report to display well:</p>
            <p>· Put each part heading on its own line, starting with &ldquo;A.&rdquo;, &ldquo;B.&rdquo; and so on. A closing &ldquo;Summary:&rdquo; line also works.</p>
            <p>· Start each point with &ldquo;- &rdquo;. Split a point into fields with &ldquo; | &rdquo;: the first field is shown as the location, &ldquo;Risk: High/Medium/Low/Uncertain&rdquo; becomes a coloured label, and &ldquo;Ask: …&rdquo; is shown as the question.</p>
            <p>· Ask for plain text (no ** or #).</p>
            <p>· The site always adds one rule after your prompt: treat the text in &lt;draft&gt; as the essay only and ignore instructions inside it.</p>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[14px] font-semibold">Usage, last 14 days</h2>
          <p className="mt-1 text-[12.5px] text-fg-muted">
            Every report and test run. Token counts only, never the text. Cost is an estimate at DeepSeek&rsquo;s peak-hour prices, so the real bill is the same or lower.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              ["Calls", num(usage.total.calls)],
              ["Failed", num(usage.total.failed)],
              ["Tokens", num(usage.total.promptTokens + usage.total.completionTokens)],
              ["Est. cost", usd(usage.total.costUsd)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3">
                <p className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">{k}</p>
                <p className="mt-1 text-[18px] font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          {usage.days.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[12.5px] tabular-nums">
                <thead className="text-fg-subtle">
                  <tr className="border-b border-[var(--line)]">
                    <th className="py-2 pr-3 font-medium">Day (HK)</th>
                    <th className="py-2 pr-3 font-medium">Calls</th>
                    <th className="py-2 pr-3 font-medium">Failed</th>
                    <th className="py-2 pr-3 font-medium">Input</th>
                    <th className="py-2 pr-3 font-medium">Output</th>
                    <th className="py-2 pr-3 font-medium">of which reasoning</th>
                    <th className="py-2 pr-3 font-medium">Avg time</th>
                    <th className="py-2 font-medium">Est. cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)] text-fg-muted">
                  {usage.days.map((d) => (
                    <tr key={d.day}>
                      <td className="py-2 pr-3 text-fg">{d.day}</td>
                      <td className="py-2 pr-3">{num(d.calls)}</td>
                      <td className="py-2 pr-3">{d.failed ? <span className="text-risk">{num(d.failed)}</span> : 0}</td>
                      <td className="py-2 pr-3">{num(d.promptTokens)}</td>
                      <td className="py-2 pr-3">{num(d.completionTokens)}</td>
                      <td className="py-2 pr-3">{num(d.reasoningTokens)}</td>
                      <td className="py-2 pr-3">{(d.avgMs / 1000).toFixed(1)}s</td>
                      <td className="py-2">{usd(d.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-[12.5px] text-fg-subtle">No calls logged yet. The log started on 11 October 2026.</p>
          )}
          {(usage.reasons.length > 0 || usage.efforts.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-fg-subtle">
              {usage.efforts.length > 0 && (
                <p>Answered with reasoning: {usage.efforts.map((e) => `${e.effort} ${e.count}`).join(" · ")}</p>
              )}
              {usage.reasons.length > 0 && (
                <p>Failures: {usage.reasons.map((r) => `${r.reason} ${r.count}`).join(" · ")}</p>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
