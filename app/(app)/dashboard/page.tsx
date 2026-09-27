import type { Metadata } from "next";
import Link from "next/link";
import { ScanText, FileCheck2, PenLine, FileStack, ArrowRight } from "lucide-react";
import { AppHeader, EmptyState } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { OrderRow } from "@/components/orders/order-row";
import { requireUser } from "@/lib/auth/session";
import { getRemainingScans } from "@/lib/scanning/usage";
import { listOrders, listScans } from "@/lib/data/user";
import { ACTIVE_STATUSES, isScreening } from "@/lib/orders/status";
import { freeScan } from "@/config/app";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const riskTone = { low: "success", moderate: "warn", elevated: "danger" } as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const [remaining, orders, scans] = await Promise.all([getRemainingScans(), listOrders(20), listScans(5)]);
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const completedScreenings = orders.filter((o) => o.status === "completed" && isScreening(o.service_type));
  const unpaid = orders.filter((o) => o.status === "awaiting_payment");
  const name = user.profile.display_name || user.email.split("@")[0];

  return (
    <>
      <AppHeader title={`Welcome, ${name}`} body="Your scans, orders and reports." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card strong tilt className="p-5">
          <p className="text-[12.5px] text-fg-muted">Free scans today</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {remaining}
            <span className="ml-1 text-[14px] font-normal text-fg-subtle">of {freeScan.dailyLimit} left</span>
          </p>
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {Array.from({ length: freeScan.dailyLimit }).map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < remaining ? "bg-accent" : "bg-white/10"}`} />
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-fg-subtle">Resets at midnight Hong Kong time</p>
        </Card>
        <Card tilt className="p-5">
          <p className="text-[12.5px] text-fg-muted">Active orders</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{active.length}</p>
          {unpaid.length > 0 && <p className="mt-3 text-[12px] text-warn">{unpaid.length} awaiting payment</p>}
        </Card>
        <Card tilt className="p-5">
          <p className="text-[12.5px] text-fg-muted">Completed screenings</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{completedScreenings.length}</p>
        </Card>
        <Card tilt className="p-5">
          <p className="text-[12.5px] text-fg-muted">Account</p>
          <p className="mt-2 truncate text-[14px] font-medium">{user.email}</p>
          <Link href="/settings" className="mt-3 inline-block text-[12.5px] text-accent hover:underline">Settings</Link>
        </Card>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { href: "/scan", icon: ScanText, t: "Run free scan", d: "Preliminary estimate", tag: "Free" },
          { href: "/services/screening", icon: FileCheck2, t: "Request screening", d: "Turnitin-backed result", tag: "Paid" },
          { href: "/services/refinement", icon: PenLine, t: "Writing review", d: "Human clarity editing", tag: "Paid" },
        ].map((q) => (
          <Link key={q.href} href={q.href} data-tilt="8" className="glass group flex items-center gap-4 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:border-[var(--line-strong)]">
            <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><q.icon className="size-5" aria-hidden /></span>
            <div className="flex-1">
              <p className="text-[14px] font-medium">{q.t}</p>
              <p className="text-[12px] text-fg-subtle">{q.d}</p>
            </div>
            <Badge tone={q.tag === "Free" ? "accent" : "neutral"}>{q.tag}</Badge>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-[15px] font-semibold">Recent orders</h2>
            <Link href="/orders" className="text-[12.5px] text-fg-muted hover:text-fg">View all</Link>
          </div>
          {orders.length ? (
            <ul className="mt-3 divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {orders.slice(0, 5).map((o) => <OrderRow key={o.id} order={o} />)}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                icon={<FileStack className="size-5" />}
                title="No orders yet"
                body="When you request a screening or writing review, it appears here with its live status."
                action={<Link href="/services/screening" className={buttonClasses("secondary", "sm")}>Request screening</Link>}
              />
            </div>
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-[15px] font-semibold">Recent scans</h2>
            <Link href="/scan/history" className="text-[12.5px] text-accent hover:underline">View all</Link>
          </div>
          {scans.length ? (
            <ul className="mt-3 divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {scans.map((s) => (
                <li key={s.id}>
                  <Link href={`/scan?id=${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-white/[0.03]">
                    <div>
                      <p className="text-[13.5px]">{s.word_count.toLocaleString()} words</p>
                      <p className="text-[12px] text-fg-subtle">{formatDateTime(s.created_at)}</p>
                    </div>
                    <Badge tone={riskTone[s.overall_risk]} dot>{s.overall_risk[0].toUpperCase() + s.overall_risk.slice(1)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                icon={<ScanText className="size-5" />}
                title="No scans yet"
                body={`You have ${remaining} free preliminary scans left today.`}
                action={<Link href="/scan" className={buttonClasses("primary", "sm")}>Run a scan <ArrowRight className="size-3.5" /></Link>}
              />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
