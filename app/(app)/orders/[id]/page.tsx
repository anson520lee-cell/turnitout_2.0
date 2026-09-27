import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormMessage } from "@/components/ui/field";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { PaymentPanel } from "@/components/orders/payment-panel";
import { ScreeningReport } from "@/components/reports/screening-report";
import { RefinementResult } from "@/components/reports/refinement-result";
import { getOrderBundle } from "@/lib/data/user";
import { isScreening, statusMeta } from "@/lib/orders/status";
import { uuid } from "@/lib/validation/schemas";
import { serviceLabels } from "@/config/services";
import { formatHKD } from "@/config/pricing";
import { devPaymentsEnabled } from "@/lib/env";
import { formatBytes, formatDateTime, shortId } from "@/lib/utils";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!uuid.safeParse(id).success) notFound();
  const bundle = await getOrderBundle(id);
  if (!bundle) notFound();
  const { order, file, screening, refinement, payments } = bundle;
  const screeningOrder = isScreening(order.service_type);

  return (
    <>
      <Link href="/orders" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Orders
      </Link>
      <AppHeader
        eyebrow={<Badge tone={screeningOrder ? "info" : "progress"}>{screeningOrder ? "Screening service · human-processed" : "Writing review"}</Badge>}
        title={order.title}
        body={`${serviceLabels[order.service_type]} · Order #${shortId(order.id)} · ${formatDateTime(order.created_at)}`}
        actions={<StatusBadge status={order.status} />}
      />

      {sp.checkout === "success" && order.status === "awaiting_payment" && (
        <div className="mb-5"><FormMessage tone="info">Payment received by Stripe. We&rsquo;re confirming it now; refresh in a moment.</FormMessage></div>
      )}
      {sp.checkout === "cancelled" && order.status === "awaiting_payment" && (
        <div className="mb-5"><FormMessage tone="info">Checkout was cancelled. You haven&rsquo;t been charged. You can pay whenever you&rsquo;re ready.</FormMessage></div>
      )}
      {sp.created === "1" && order.status === "awaiting_payment" && (
        <div className="mb-5"><FormMessage tone="success">Order created{file ? " and your document uploaded securely" : ""}. Review the details and pay to place it in the queue.</FormMessage></div>
      )}

      <Card className="mb-5 p-5 sm:p-6">
        <OrderTimeline type={order.service_type} status={order.status} />
        {order.status !== "completed" && order.status !== "cancelled" && (
          <p className="mt-5 border-t border-[var(--line)] pt-4 text-[13px] text-fg-muted">{statusMeta[order.status].customerHint}</p>
        )}
      </Card>

      {order.status === "completed" && screeningOrder && screening && (
        <ScreeningReport order={order} file={file} result={screening} />
      )}
      {order.status === "completed" && !screeningOrder && refinement && (
        <RefinementResult orderId={order.id} original={order.source_text} revised={refinement.revised_text} notes={refinement.reviewer_notes} />
      )}

      {order.status !== "completed" && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold">Order details</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-4 text-[13.5px] sm:grid-cols-2">
              <div><dt className="text-fg-subtle">Service</dt><dd className="mt-0.5">{serviceLabels[order.service_type]}</dd></div>
              <div><dt className="text-fg-subtle">Price</dt><dd className="mt-0.5">{formatHKD(order.price)}</dd></div>
              {file && <div><dt className="text-fg-subtle">File</dt><dd className="mt-0.5 truncate">{file.file_name} · {formatBytes(file.file_size)}</dd></div>}
              <div><dt className="text-fg-subtle">Word count</dt><dd className="mt-0.5">{order.word_count?.toLocaleString() ?? "Counted during processing"}</dd></div>
              {order.instructions && <div className="sm:col-span-2"><dt className="text-fg-subtle">{screeningOrder ? "Notes" : "Instructions"}</dt><dd className="mt-0.5 whitespace-pre-wrap text-fg-muted">{order.instructions}</dd></div>}
              {order.paid_at && <div><dt className="text-fg-subtle">Paid</dt><dd className="mt-0.5">{formatDateTime(order.paid_at)}</dd></div>}
            </dl>
            {screeningOrder && (
              <p className="mt-6 rounded-xl border border-[var(--line)] bg-ink-900/40 p-3.5 text-[12.5px] leading-relaxed text-fg-muted">
                What you&rsquo;ll receive: the result a Turnitin screening returns for this document, entered exactly as returned, plus the report file where available. It is not a prediction.
              </p>
            )}
          </Card>
          <Card strong className="p-5 sm:p-6">
            {order.status === "awaiting_payment" ? (
              <>
                <h2 className="text-[15px] font-semibold">Payment</h2>
                <p className="mt-1 text-[13px] text-fg-muted">Your order joins the queue once payment is confirmed.</p>
                <div className="mt-5">
                  <PaymentPanel orderId={order.id} price={formatHKD(order.price)} devPayments={devPaymentsEnabled()} />
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[15px] font-semibold">Payment</h2>
                {payments.length ? (
                  <ul className="mt-3 space-y-2 text-[13px]">
                    {payments.map((p) => (
                      <li key={p.id} className="flex justify-between">
                        <span className="text-fg-muted">{p.provider === "dev" ? "Simulated (dev)" : "Stripe"} · {formatDateTime(p.created_at)}</span>
                        <span>{formatHKD(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[13px] text-fg-muted">{order.status === "cancelled" ? "No payment taken." : "Payment recorded."}</p>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
