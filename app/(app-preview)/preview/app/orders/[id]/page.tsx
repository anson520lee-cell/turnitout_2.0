import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { OrderDetails } from "@/components/orders/order-details";
import { AutoReportView } from "@/components/reports/auto-report-view";
import { sampleReport } from "@/lib/auto-report/sample";
import { serviceLabels } from "@/config/services";
import { statusMeta } from "@/lib/orders/status";
import { formatDateTime, shortId } from "@/lib/utils";
import { demoOrders, demoPath } from "../../demo";

/**
 * One order of the made-up account. A completed one shows the finished report with example data
 * (the same as /sample-report); the others show their progress and details. The live scan and the
 * payment panel need a real order, so they are not part of this preview.
 */
export default async function AppPreviewOrder({ params }: PageProps<"/preview/app/orders/[id]">) {
  const { id } = await params;
  const order = demoOrders.find((o) => o.id === id);
  if (!order) notFound();
  const open = order.status !== "completed" && order.status !== "cancelled";
  return (
    <>
      <Link href={demoPath.orders} className="app-back mb-5">
        <ArrowLeft className="size-3.5" aria-hidden /> <span className="link-line">Orders</span>
      </Link>
      <AppHeader
        eyebrow={<Badge tone="info">AI-writing risk report</Badge>}
        title={order.title}
        body={`${serviceLabels[order.service_type]} · Order #${shortId(order.id)} · ${formatDateTime(order.created_at)}`}
        actions={<StatusBadge status={order.status} />}
      />

      <Card className="mb-5 p-5 sm:p-6">
        <OrderTimeline type={order.service_type} status={order.status} />
        {open && <p className="mt-5 border-t border-[var(--line)] pt-4 text-[13px] text-fg-muted">{statusMeta[order.status].customerHint}</p>}
      </Card>

      {order.status === "completed" ? (
        <AutoReportView title={order.title} finishedAt={formatDateTime(order.completed_at ?? order.created_at)} result={sampleReport} rewriteDemo />
      ) : order.status === "cancelled" ? (
        <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
          <Card strong className="p-5 sm:p-7">
            <h2 className="text-[15px] font-semibold">Order cancelled</h2>
            <p className="mt-1 text-[13px] text-fg-muted">Nothing was charged and your text has been deleted. You can start a new one whenever you like.</p>
            <Link href="/services/screening" className={buttonClasses("primary", "lg", "mt-5")}>
              Get a new report
            </Link>
          </Card>
          <OrderDetails order={order} file={null} payments={[]} />
        </div>
      ) : (
        <div className="max-w-xl">
          <OrderDetails order={order} file={null} payments={[]} />
        </div>
      )}
    </>
  );
}
