import type { Metadata } from "next";
import Link from "next/link";
import { FileStack } from "lucide-react";
import { AppHeader, EmptyState } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { OrderRow } from "@/components/orders/order-row";
import { listOrders, listPendingClaimOrderIds } from "@/lib/data/user";
import { ACTIVE_STATUSES } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "unpaid", label: "Awaiting payment" },
] as const;

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const { filter = "all" } = await searchParams;
  const [all, pendingClaims] = await Promise.all([listOrders(200), listPendingClaimOrderIds()]);
  const orders = all.filter((o) =>
    filter === "active" ? ACTIVE_STATUSES.includes(o.status)
    : filter === "completed" ? o.status === "completed"
    : filter === "unpaid" ? o.status === "awaiting_payment"
    : true,
  );
  return (
    <>
      <AppHeader
        title="Orders"
        body="Reports and writing refinement orders, with their live status."
        actions={
          <>
            <Link href="/services/refinement" className={buttonClasses("secondary", "md")}>Refine writing</Link>
            <Link href="/services/screening" className={buttonClasses("primary", "md")}>Get a report</Link>
          </>
        }
      />
      <nav aria-label="Filter orders" className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? "/orders" : `/orders?filter=${f.id}`}
            aria-current={filter === f.id ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] transition",
              filter === f.id ? "border-accent/40 bg-accent/10 text-fg" : "border-[var(--line)] text-fg-muted hover:text-fg",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {orders.length ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-[var(--line)]">
            {orders.map((o) => <OrderRow key={o.id} order={o} paymentPending={pendingClaims.has(o.id)} />)}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={<FileStack className="size-5" />}
          title={filter === "all" ? "No orders yet" : "Nothing here"}
          body={filter === "all" ? "Get a report or request writing refinement to get started." : "No orders match this filter."}
          action={<Link href="/services/screening" className={buttonClasses("secondary", "sm")}>Get a report</Link>}
        />
      )}
    </>
  );
}
