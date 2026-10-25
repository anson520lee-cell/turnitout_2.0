import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { requireUser } from "@/lib/auth/session";
import { getFreeReportStatus } from "@/lib/free-report";
import { listOrders, listPendingClaimOrderIds } from "@/lib/data/user";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [dailyReport, orders, pendingClaims] = await Promise.all([
    getFreeReportStatus(),
    listOrders(20),
    listPendingClaimOrderIds(),
  ]);
  return (
    <DashboardView
      email={user.email}
      displayName={user.profile.display_name}
      dailyReport={dailyReport}
      orders={orders}
      pendingClaims={pendingClaims}
    />
  );
}
