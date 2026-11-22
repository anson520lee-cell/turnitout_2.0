import { DashboardView } from "@/components/dashboard/dashboard-view";
import { demoEmail, demoName, demoOrders, demoPath, demoPendingClaims } from "./demo";

/** The signed-in overview with a made-up account. ?state=used shows today's free report as used. */
export default async function AppPreviewOverview({ searchParams }: PageProps<"/preview/app">) {
  const { state } = await searchParams;
  return (
    <DashboardView
      email={demoEmail}
      displayName={demoName}
      dailyReport={{ mode: "account", remaining: state === "used" ? 0 : 1, unlimited: false }}
      orders={demoOrders}
      pendingClaims={demoPendingClaims}
      links={{ settings: demoPath.settings, orders: demoPath.orders, order: demoPath.order }}
    />
  );
}
