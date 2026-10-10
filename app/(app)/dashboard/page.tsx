import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { requireUser } from "@/lib/auth/session";
import { getRemainingScans } from "@/lib/scanning/usage";
import { listOrders, listPendingClaimOrderIds, listScans } from "@/lib/data/user";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [remaining, orders, scans, pendingClaims] = await Promise.all([
    getRemainingScans(),
    listOrders(20),
    listScans(5),
    listPendingClaimOrderIds(),
  ]);
  return (
    <DashboardView
      email={user.email}
      displayName={user.profile.display_name}
      remaining={remaining}
      orders={orders}
      scans={scans}
      pendingClaims={pendingClaims}
    />
  );
}
