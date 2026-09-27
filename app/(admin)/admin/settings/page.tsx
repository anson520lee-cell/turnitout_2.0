import type { Metadata } from "next";
import { assertAdmin } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brand, freeScan, retention, uploads } from "@/config/app";
import { formatHKD, refinementPricing, screeningPrices } from "@/config/pricing";
import { serviceLabels } from "@/config/services";
import { isStripeConfigured, devPaymentsEnabled } from "@/lib/env";
import { getScreeningProvider } from "@/lib/screening";
import { getAnalyzer } from "@/lib/scanning";

export const metadata: Metadata = { title: "Admin · Settings" };

export default async function AdminSettings() {
  await assertAdmin();
  const provider = getScreeningProvider();
  const rows: [string, React.ReactNode][] = [
    ["Brand", brand.name],
    ["Free scans / day", `${freeScan.dailyLimit} (${freeScan.timezone})`],
    ["Preliminary analyzer", getAnalyzer().id],
    ["Screening provider", `${provider.id} · ${provider.manual ? "manual (human-in-the-loop)" : "automated"}`],
    ["Stripe", isStripeConfigured() ? <Badge tone="success" key="s">Configured</Badge> : <Badge tone="warn" key="s">Not configured</Badge>],
    ["Dev payments", devPaymentsEnabled() ? <Badge tone="warn" key="d">Enabled</Badge> : "Off"],
    ["Retention job", process.env.CRON_SECRET ? <Badge tone="success" key="c">CRON_SECRET set</Badge> : <Badge tone="warn" key="c">CRON_SECRET missing: deletion job won&rsquo;t run</Badge>],
    ["Source documents kept", `${retention.sourceDocumentDays} days after completion`],
    ["Reports kept", `${retention.reportDays} days after completion`],
    ["Store free-scan text", retention.storeScanText ? "Yes" : "No"],
    ["Upload limit", `${uploads.maxBytes / 1024 / 1024} MB · PDF, DOCX`],
  ];
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-[13px] text-fg-muted">Read-only. Change values in <code className="font-mono">config/*.ts</code> and redeploy.</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold">Configuration</h2>
          <dl className="mt-2 divide-y divide-[var(--line)] text-[13px]">
            {rows.map(([k, v]) => <div key={k} className="grid grid-cols-[180px_1fr] gap-3 py-2.5"><dt className="text-fg-subtle">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold">Pricing (config/pricing.ts)</h2>
          <dl className="mt-2 divide-y divide-[var(--line)] text-[13px]">
            {Object.entries(screeningPrices).map(([k, v]) => <div key={k} className="grid grid-cols-[180px_1fr] gap-3 py-2.5"><dt className="text-fg-subtle">{serviceLabels[k as keyof typeof serviceLabels]}</dt><dd>{formatHKD(v)}</dd></div>)}
            <div className="grid grid-cols-[180px_1fr] gap-3 py-2.5"><dt className="text-fg-subtle">Writing refinement</dt><dd>{formatHKD(refinementPricing.perBlock)} / {refinementPricing.blockWords} words, min {formatHKD(refinementPricing.minimum)}</dd></div>
          </dl>
          <p className="mt-4 rounded-xl border border-[var(--line)] bg-ink-900/40 p-3 text-[12px] leading-relaxed text-fg-muted">
            Turnitin credentials are intentionally not configurable here. Screening is performed outside this application.
          </p>
        </Card>
      </div>
    </>
  );
}
