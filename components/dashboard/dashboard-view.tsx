import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { ArrowRight, FileStack } from "lucide-react";
import { AppHeader, EmptyState } from "@/components/layout/app-header";
import { buttonClasses } from "@/components/ui/button";
import { OrderRow } from "@/components/orders/order-row";
import { DailyReportCard, type DailyReportStatus } from "@/components/orders/daily-report-card";
import type { Order } from "@/types/domain";
import { ACTIVE_STATUSES, isScreening } from "@/lib/orders/status";
import { reportFromLabel } from "@/config/services";

/**
 * The signed-in overview. Takes plain data so the real page and the design preview render the same thing.
 * Figures sit on hairlines (no boxes), the next action is one ruled row, and the recent orders are an indexed list.
 */
export function DashboardView({
  email,
  displayName,
  dailyReport,
  orders,
  pendingClaims,
  links = { settings: "/settings", orders: "/orders", order: (id: string) => `/orders/${id}` },
}: {
  email: string;
  displayName: string | null;
  /** The daily free report allowance; the card is left out when not given. */
  dailyReport?: DailyReportStatus;
  orders: Order[];
  pendingClaims: Set<string>;
  /** Where the overview links to (the design preview keeps its links inside the preview). */
  links?: { settings: string; orders: string; order: (id: string) => string };
}) {
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const completedScreenings = orders.filter((o) => o.status === "completed" && isScreening(o.service_type));
  const unpaid = orders.filter((o) => o.status === "awaiting_payment" && !pendingClaims.has(o.id));
  const confirming = orders.filter((o) => o.status === "awaiting_payment" && pendingClaims.has(o.id));
  const name = displayName || email.split("@")[0];

  return (
    <>
      <AppHeader title={`Welcome, ${name}`} body="Your orders and reports." />

      <dl className="app-stats">
        <div className="app-stat">
          <dt>
            <span className="nav-idx">01</span> Active orders
          </dt>
          <dd className="app-stat-num">{active.length}</dd>
          {confirming.length > 0 && (
            <dd className="app-stat-note">
              {confirming.length} payment{confirming.length > 1 ? "s" : ""} being confirmed
            </dd>
          )}
          {unpaid.length > 0 && <dd className="app-stat-note text-warn">{unpaid.length} awaiting payment</dd>}
        </div>
        <div className="app-stat">
          <dt>
            <span className="nav-idx">02</span> Completed reports
          </dt>
          <dd className="app-stat-num">{completedScreenings.length}</dd>
        </div>
        <div className="app-stat">
          <dt>
            <span className="nav-idx">03</span> Account
          </dt>
          <dd className="mt-3 truncate text-[14px] font-medium">{email}</dd>
          <dd className="mt-2">
            <Link href={links.settings} className="link-line text-[12.5px] text-fg-muted">
              Settings
            </Link>
          </dd>
        </div>
      </dl>

      {dailyReport && <DailyReportCard status={dailyReport} className="mt-6" />}

      <Link href="/services/screening" data-press className="app-go group mt-6">
        <span className="app-go-k">Next</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-fg">Get a report</span>
          <span className="block text-[12.5px] text-fg-subtle">AI-writing risk, sentence by sentence · {reportFromLabel}</span>
        </span>
        <ArrowRight className="app-go-arrow size-4" aria-hidden />
      </Link>

      <section className="mt-10" aria-labelledby="recent-orders">
        <div className="app-section-head">
          <h2 id="recent-orders" className="app-section-title">
            Recent orders
          </h2>
          <Link href={links.orders} className="link-line text-[12.5px] text-fg-muted">
            View all
          </Link>
        </div>
        {orders.length ? (
          <ul className="app-list">
            {orders.slice(0, 5).map((o, i) => (
              <OrderRow key={o.id} order={o} index={i} href={links.order(o.id)} paymentPending={pendingClaims.has(o.id)} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<FileStack className="size-5" strokeWidth={1.5} />}
            title="No orders yet"
            body="When you get a report, it appears here with its live status."
            action={
              <Link href="/services/screening" className={buttonClasses("secondary", "sm")}>
                Get a report
              </Link>
            }
          />
        )}
      </section>
    </>
  );
}
