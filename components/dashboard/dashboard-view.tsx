import Link from "next/link";
import { FileCheck2, PenLine, FileStack } from "lucide-react";
import { AppHeader, EmptyState } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { OrderRow } from "@/components/orders/order-row";
import { HudCorners, HudLabel, SegmentBar } from "@/components/ui/hud";
import { FreeReportCard, type FreeReportCardStatus } from "@/components/orders/free-report-card";
import type { Order } from "@/types/domain";
import { ACTIVE_STATUSES, isScreening } from "@/lib/orders/status";
import { freeReport as freeReportConfig } from "@/config/app";
import { formatCredits, refinementPricing } from "@/config/pricing";


/** The signed-in overview. Takes plain data so the real page and the design preview render the same thing. */
export function DashboardView({
  email,
  displayName,
  freeReport,
  orders,
  pendingClaims,
}: {
  email: string;
  displayName: string | null;
  /** The account's free report: still available, or used. */
  freeReport: FreeReportCardStatus;
  orders: Order[];
  pendingClaims: Set<string>;
}) {
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const completedScreenings = orders.filter((o) => o.status === "completed" && isScreening(o.service_type));
  const unpaid = orders.filter((o) => o.status === "awaiting_payment" && !pendingClaims.has(o.id));
  const confirming = orders.filter((o) => o.status === "awaiting_payment" && pendingClaims.has(o.id));
  const name = displayName || email.split("@")[0];
  const freeReportLeft = freeReport.mode === "account" ? freeReport.remaining : freeReportConfig.perUserLimit;

  return (
    <>
      <AppHeader title={`Welcome, ${name}`} body="Your orders and reports." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card strong tilt className="p-5">
          <HudCorners />
          <HudLabel>Free report</HudLabel>
          <p className="tile-num mt-3 text-4xl font-semibold tracking-tight">
            {freeReportLeft}
            <span className="ml-1 text-[14px] font-normal text-fg-subtle">of {freeReportConfig.perUserLimit} left</span>
          </p>
          <SegmentBar className="mt-4" value={(freeReportLeft / freeReportConfig.perUserLimit) * 100} segments={freeReportConfig.perUserLimit * 4} />
          <p className="mt-3 text-[11.5px] text-fg-subtle">One free report per account</p>
        </Card>
        <Card tilt className="p-5">
          <HudCorners />
          <HudLabel>Active orders</HudLabel>
          <p className="tile-num mt-3 text-4xl font-semibold tracking-tight">{active.length}</p>
          {confirming.length > 0 && <p className="mt-3 text-[12px] text-fg-muted">{confirming.length} payment{confirming.length > 1 ? "s" : ""} being confirmed</p>}
          {unpaid.length > 0 && <p className="mt-1 text-[12px] text-warn">{unpaid.length} awaiting payment</p>}
        </Card>
        <Card tilt className="p-5">
          <HudCorners />
          <HudLabel>Completed reports</HudLabel>
          <p className="tile-num mt-3 text-4xl font-semibold tracking-tight">{completedScreenings.length}</p>
        </Card>
        <Card tilt className="p-5">
          <HudCorners />
          <HudLabel>Account</HudLabel>
          <p className="mt-3 truncate text-[14px] font-medium">{email}</p>
          <Link href="/settings" className="mt-3 inline-block text-[12.5px] text-accent hover:underline">Settings</Link>
        </Card>
      </div>

      <FreeReportCard status={freeReport} className="mt-5" />

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          { href: "/services/screening", icon: FileCheck2, t: "Get a report", d: "AI-writing risk, sentence by sentence", tag: "First one free" },
          { href: "/services/refinement", icon: PenLine, t: "Writing refinement", d: `${formatCredits(refinementPricing.perBlock)} per ${refinementPricing.blockChars} characters`, tag: `From ${formatCredits(refinementPricing.minimum)}` },
        ].map((q) => (
          <Link key={q.href} href={q.href} data-tilt="8" data-press className="glass group flex items-center gap-4 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:border-[var(--line-strong)]">
            <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><q.icon className="size-5" aria-hidden /></span>
            <div className="flex-1">
              <p className="text-[14px] font-medium">{q.t}</p>
              <p className="text-[12px] text-fg-subtle">{q.d}</p>
            </div>
            <Badge tone={q.href === "/services/screening" ? "accent" : "neutral"}>{q.tag}</Badge>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-[15px] font-semibold">Recent orders</h2>
            <Link href="/orders" className="text-[12.5px] text-fg-muted hover:text-fg">View all</Link>
          </div>
          {orders.length ? (
            <ul className="mt-3 divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {orders.slice(0, 5).map((o) => <OrderRow key={o.id} order={o} paymentPending={pendingClaims.has(o.id)} />)}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                icon={<FileStack className="size-5" />}
                title="No orders yet"
                body="When you get a report or request writing refinement, it appears here with its live status."
                action={<Link href="/services/screening" className={buttonClasses("secondary", "sm")}>Get a report</Link>}
              />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
