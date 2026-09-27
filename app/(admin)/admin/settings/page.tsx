import type { Metadata } from "next";
import { assertAdmin } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brand, freeScan, refinement, retention, uploads } from "@/config/app";
import { formatHKD, screeningPrices } from "@/config/pricing";
import { refinementMinimumLabel, refinementRateLabel, reportService, serviceLabels, wordRangeLabel } from "@/config/services";
import { isPlaceholder, manualPaymentList, referencePrefix } from "@/config/payments";
import { isStripeConfigured, devPaymentsEnabled } from "@/lib/env";
import { notificationChannels } from "@/lib/notify";
import { getScreeningProvider } from "@/lib/screening";
import { getAnalyzer } from "@/lib/scanning";

export const metadata: Metadata = { title: "Admin · Settings" };

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="mt-2 divide-y divide-[var(--line)] text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[180px_1fr] gap-3 py-2.5">
          <dt className="text-fg-subtle">{k}</dt>
          <dd className="min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const on = (label = "Configured") => <Badge tone="success">{label}</Badge>;
const off = (label = "Not configured") => <Badge tone="warn">{label}</Badge>;
const env = (name: string) => <code className="font-mono text-[12px] text-fg">{name}</code>;

export default async function AdminSettings() {
  await assertAdmin();
  const provider = getScreeningProvider();
  const channels = notificationChannels();
  const rows: [string, React.ReactNode][] = [
    ["Brand", brand.name],
    ["Free scans / day", `${freeScan.dailyLimit} (${freeScan.timezone})`],
    ["Preliminary analyzer", getAnalyzer().id],
    ["Screening provider", `${provider.id} · ${provider.manual ? "manual (human-in-the-loop)" : "automated"}`],
    ["Card payments (Stripe)", isStripeConfigured() ? on() : off("Not configured: card option hidden")],
    ["Dev payments", devPaymentsEnabled() ? <Badge tone="warn" key="d">Enabled</Badge> : "Off"],
    ["Retention job", process.env.CRON_SECRET ? on("CRON_SECRET set") : off("CRON_SECRET missing: deletion job won't run")],
    ["Source text kept", `${retention.sourceDocumentDays} days after completion`],
    ["Reports kept", `${retention.reportDays} days after completion`],
    ["Store free-scan text", retention.storeScanText ? "Yes" : "No"],
    ["Report upload limit", `${uploads.maxBytes / 1024 / 1024} MB · PDF, DOCX`],
  ];

  const notifyRows: [string, React.ReactNode][] = [
    [
      "Telegram",
      <div key="t" className="space-y-1">
        {channels.telegram ? on() : off()}
        <p className="text-[12px] text-fg-subtle">Set {env("TELEGRAM_BOT_TOKEN")} and {env("TELEGRAM_CHAT_ID")}.</p>
      </div>,
    ],
    [
      "Email (Resend)",
      <div key="e" className="space-y-1">
        {channels.email ? on() : off()}
        <p className="text-[12px] text-fg-subtle">
          Set {env("RESEND_API_KEY")} and {env("NOTIFY_EMAIL_TO")} (comma-separated). Optional {env("NOTIFY_EMAIL_FROM")}.
        </p>
      </div>,
    ],
    [
      "Free-scan messages",
      <div key="s" className="space-y-1">
        {channels.scans ? <Badge tone="info">On</Badge> : <Badge>Off</Badge>}
        <p className="text-[12px] text-fg-subtle">Set {env("NOTIFY_ON_SCANS")}=false to stop a message for every free scan.</p>
      </div>,
    ],
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-[13px] text-fg-muted">
        Read-only. Change values in <code className="font-mono">config/*.ts</code> or environment variables and redeploy.
      </p>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold">Configuration</h2>
          <Rows rows={rows} />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold">Owner notifications</h2>
            <p className="mt-1 text-[12.5px] text-fg-muted">
              Sent for new orders, reported payments, confirmations and rejections{channels.scans ? ", and free scans" : ""}. Messages
              carry order numbers, amounts, methods and the account email, never document text or titles.
            </p>
            {!channels.telegram && !channels.email && (
              <p className="mt-3 rounded-xl border border-warn/25 bg-warn/[0.06] p-3 text-[12.5px] text-[#f7d9a0]">
                No channel is configured, so you won&rsquo;t be told about new orders or payments. Set up Telegram or email.
              </p>
            )}
            <Rows rows={notifyRows} />
          </Card>

          <Card className="p-5">
            <h2 className="text-[14px] font-semibold">Pricing (config/pricing.ts)</h2>
            <Rows
              rows={[
                [serviceLabels[reportService], `${formatHKD(screeningPrices[reportService])} per report · ${wordRangeLabel}`],
                [serviceLabels.refinement, `${refinementRateLabel} · ${refinementMinimumLabel}`],
                ["Refinement length", `${refinement.minChars.toLocaleString("en-HK")}–${refinement.maxChars.toLocaleString("en-HK")} characters per order`],
              ]}
            />
            <p className="mt-4 rounded-xl border border-[var(--line)] bg-ink-900/40 p-3 text-[12px] leading-relaxed text-fg-muted">
              Turnitin credentials are intentionally not configurable here. Screening is performed outside this application.
            </p>
          </Card>
        </div>

        <Card className="p-5 lg:col-span-2">
          <h2 className="text-[14px] font-semibold">Manual payment methods (config/payments.ts)</h2>
          <p className="mt-1 text-[12.5px] text-fg-muted">
            Customers see these details on the order page and include a reference like <span className="font-mono text-fg">{referencePrefix}-1A2B3C4D</span>.
            Replace every value starting with &ldquo;REPLACE&rdquo; and add QR images under <code className="font-mono">public/payments/</code>.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {manualPaymentList.map((m) => {
              const unset = m.payee.filter((p) => isPlaceholder(p.value)).map((p) => p.label);
              if (m.link !== undefined && isPlaceholder(m.link)) unset.push("Pay link");
              return (
                <div key={m.id} className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-4 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{m.label}</p>
                    {!m.enabled ? <Badge>Disabled</Badge> : unset.length ? <Badge tone="warn">Needs details</Badge> : <Badge tone="success">Ready</Badge>}
                  </div>
                  <p className="mt-2 text-[12px] text-fg-subtle">
                    QR image: {m.qrImage ? <code className="font-mono text-fg-muted">public{m.qrImage}</code> : "none"}
                  </p>
                  {unset.length > 0 && <p className="mt-1 text-[12px] text-warn">Still placeholder: {unset.join(", ")}</p>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
