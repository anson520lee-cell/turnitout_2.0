import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { FileStack } from "lucide-react";
import { AppHeader, EmptyState } from "@/components/layout/app-header";
import { buttonClasses } from "@/components/ui/button";
import { OrderRow } from "@/components/orders/order-row";
import { ACTIVE_STATUSES } from "@/lib/orders/status";
import type { Order } from "@/types/domain";

export const ORDER_FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "unpaid", label: "Awaiting payment" },
] as const;

export function filterOrders(all: Order[], filter: string) {
  return all.filter((o) =>
    filter === "active" ? ACTIVE_STATUSES.includes(o.status)
    : filter === "completed" ? o.status === "completed"
    : filter === "unpaid" ? o.status === "awaiting_payment"
    : true,
  );
}

/**
 * All orders: filters as tabs on one hairline (the one in use underlined by a
 * 1px line that draws in), and the orders as an indexed list. Takes plain data so the real page
 * and the design preview render the same thing.
 */
export function OrdersView({
  orders,
  pendingClaims,
  filter,
  base = "/orders",
  order = (id: string) => `/orders/${id}`,
}: {
  orders: Order[];
  pendingClaims: Set<string>;
  filter: string;
  /** The page the filter tabs link to. */
  base?: string;
  order?: (id: string) => string;
}) {
  return (
    <>
      <AppHeader
        title="Orders"
        body="Your reports, with their live status."
        actions={
          <Link href="/services/screening" className={buttonClasses("primary", "md")}>
            Get a report
          </Link>
        }
      />
      <nav aria-label="Filter orders" className="app-tabs">
        {ORDER_FILTERS.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? base : `${base}?filter=${f.id}`}
            aria-current={filter === f.id ? "page" : undefined}
            data-press
            className="app-tab"
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {orders.length ? (
        <ul className="app-list">
          {orders.map((o, i) => (
            <OrderRow key={o.id} order={o} index={i} href={order(o.id)} paymentPending={pendingClaims.has(o.id)} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<FileStack className="size-5" strokeWidth={1.5} />}
          title={filter === "all" ? "No orders yet" : "Nothing here"}
          body={filter === "all" ? "Get a report to get started." : "No orders match this filter."}
          action={
            <Link href="/services/screening" className={buttonClasses("secondary", "sm")}>
              Get a report
            </Link>
          }
        />
      )}
    </>
  );
}
