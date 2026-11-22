import type { Metadata } from "next";
import { OrdersView, filterOrders } from "@/components/orders/orders-view";
import { listOrders, listPendingClaimOrderIds } from "@/lib/data/user";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const { filter = "all" } = await searchParams;
  const [all, pendingClaims] = await Promise.all([listOrders(200), listPendingClaimOrderIds()]);
  const f = typeof filter === "string" ? filter : "all";
  return <OrdersView orders={filterOrders(all, f)} pendingClaims={pendingClaims} filter={f} />;
}
