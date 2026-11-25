import { OrdersView, filterOrders } from "@/components/orders/orders-view";
import { demoOrders, demoPath, demoPendingClaims } from "../demo";

/** All orders, with the same filters as the real page, for a made-up account. */
export default async function AppPreviewOrders({ searchParams }: PageProps<"/preview/app/orders">) {
  const { filter } = await searchParams;
  const f = typeof filter === "string" ? filter : "all";
  return <OrdersView orders={filterOrders(demoOrders, f)} pendingClaims={demoPendingClaims} filter={f} base={demoPath.orders} order={demoPath.order} reportHref="/preview/app/reports/new" />;
}
