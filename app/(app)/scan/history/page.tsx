import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ScanText } from "lucide-react";
import { AppHeader, EmptyState } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { listScans } from "@/lib/data/user";
import { formatDateTime } from "@/lib/utils";
import type { RiskLevel } from "@/lib/scanning/types";

export const metadata: Metadata = { title: "Scan history" };

const riskTone = { low: "success", moderate: "warn", elevated: "danger" } as const;
const riskLabel: Record<RiskLevel, string> = { low: "Low", moderate: "Moderate", elevated: "Elevated" };
const riskBar: Record<RiskLevel, string> = { low: "bg-ok", moderate: "bg-warn", elevated: "bg-risk" };

export default async function ScanHistoryPage() {
  const scans = await listScans(100);
  const counts = scans.reduce(
    (acc, s) => ({ ...acc, [s.overall_risk]: acc[s.overall_risk] + 1 }),
    { low: 0, moderate: 0, elevated: 0 } as Record<RiskLevel, number>,
  );
  const words = scans.reduce((a, s) => a + s.word_count, 0);

  return (
    <>
      <AppHeader
        title="Scan history"
        body="Your preliminary scans, newest first. Only the scores are kept; the text you scanned isn't stored."
        actions={<Link href="/scan" className={buttonClasses("primary", "md")}>New scan <ArrowRight className="size-4" /></Link>}
      />

      {scans.length === 0 ? (
        <EmptyState
          icon={<ScanText className="size-5" />}
          title="No scans yet"
          body="Run a free preliminary scan and it will appear here."
          action={<Link href="/scan" className={buttonClasses("primary", "sm")}>Run a scan</Link>}
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              ["Scans", scans.length.toLocaleString()],
              ["Words scanned", words.toLocaleString()],
              ["Elevated", String(counts.elevated)],
              ["Low", String(counts.low)],
            ].map(([k, v]) => (
              <Card key={k} tilt className="p-5">
                <p className="text-[12px] text-fg-subtle">{k}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{v}</p>
              </Card>
            ))}
          </div>

          {/* Oldest → newest strip of results, so a trend across drafts is visible. */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">Across your drafts</h2>
              <span className="text-[12px] text-fg-subtle">Oldest to newest</span>
            </div>
            <div className="mt-4 flex h-16 items-end gap-1" aria-hidden>
              {[...scans].reverse().map((s) => (
                <span
                  key={s.id}
                  className={`${riskBar[s.overall_risk]} w-full max-w-4 rounded-t opacity-80`}
                  style={{ height: s.overall_risk === "elevated" ? "100%" : s.overall_risk === "moderate" ? "62%" : "30%" }}
                />
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <table className="w-full text-left text-[13.5px]">
              <thead className="border-b border-[var(--line)] text-[12px] text-fg-subtle">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Words</th>
                  <th className="hidden px-5 py-3 font-medium sm:table-cell">Grade level</th>
                  <th className="px-5 py-3 font-medium">Estimate</th>
                  <th className="px-5 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {scans.map((s) => (
                  <tr key={s.id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-3.5 text-fg-muted">{formatDateTime(s.created_at)}</td>
                    <td className="px-5 py-3.5">{s.word_count.toLocaleString()}</td>
                    <td className="hidden px-5 py-3.5 text-fg-muted sm:table-cell">
                      {s.result_json.readability?.gradeLevel?.toFixed(1) ?? "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={riskTone[s.overall_risk]} dot>{riskLabel[s.overall_risk]}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/scan?id=${s.id}`} className="text-[13px] text-accent hover:underline">
                        View report
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
