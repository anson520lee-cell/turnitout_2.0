import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormMessage } from "@/components/ui/field";
import { WaitingAnimation } from "@/components/ui/waiting";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { OrderDetails } from "@/components/orders/order-details";
import { CreditPayPanel } from "@/components/billing/credit-pay-panel";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { ScreeningReport } from "@/components/reports/screening-report";
import { RefinementResult } from "@/components/reports/refinement-result";
import { getOrderBundle } from "@/lib/data/user";
import { ACTIVE_STATUSES, isScreening, statusMeta } from "@/lib/orders/status";
import { uuid } from "@/lib/validation/schemas";
import { serviceLabels } from "@/config/services";
import { CREDITS_PER_USD, formatCredits, toCredits, topUp } from "@/config/pricing";
import { manualPayments, paymentReference } from "@/config/payments";
import { devPaymentsEnabled } from "@/lib/env";
import { getCreditBalance } from "@/lib/credits";
import { formatDateTime, shortId } from "@/lib/utils";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!uuid.safeParse(id).success) notFound();
  const bundle = await getOrderBundle(id);
  if (!bundle) notFound();
  const { order, file, screening, refinement, payments, claims } = bundle;
  const screeningOrder = isScreening(order.service_type);
  const unpaid = order.status === "awaiting_payment";
  const pendingClaim = unpaid ? claims.find((c) => c.status === "pending") ?? null : null;
  // Back from Stripe before its webhook has marked the order paid: wait for
  // it (the page refreshes itself) instead of offering to pay again.
  const confirmingCard = sp.checkout === "success" && unpaid && !pendingClaim;
  const rejectedClaim = unpaid && !pendingClaim && claims[0]?.status === "rejected" ? claims[0] : null;
  const inProgress = ACTIVE_STATUSES.includes(order.status);
  const reference = paymentReference(order.id);
  const balance = unpaid ? await getCreditBalance() : 0;
  const shortfall = Math.max(0, toCredits(order.price) - balance);
  const suggestedUsd = Math.min(topUp.maxUsd, Math.max(topUp.minUsd, Math.ceil(shortfall / CREDITS_PER_USD)));

  return (
    <>
      <Link href="/orders" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Orders
      </Link>
      <AppHeader
        eyebrow={<Badge tone={screeningOrder ? "info" : "progress"}>{screeningOrder ? "Report · human-processed" : "Writing Refinement"}</Badge>}
        title={order.title}
        body={`${serviceLabels[order.service_type]} · Order #${shortId(order.id)} · ${formatDateTime(order.created_at)}`}
        actions={pendingClaim ? <Badge tone="warn" dot>Confirming payment</Badge> : <StatusBadge status={order.status} />}
      />

      {sp.checkout === "cancelled" && unpaid && (
        <div className="mb-5"><FormMessage tone="info">Checkout was cancelled. You haven&rsquo;t been charged. You can pay whenever you&rsquo;re ready.</FormMessage></div>
      )}
      {sp.created === "1" && unpaid && !pendingClaim && (
        <div className="mb-5"><FormMessage tone="success">Order created. Choose how to pay below; your order joins the queue as soon as payment is confirmed.</FormMessage></div>
      )}

      <Card className="mb-5 p-5 sm:p-6">
        <OrderTimeline type={order.service_type} status={order.status} />
        {order.status !== "completed" && order.status !== "cancelled" && (
          <p className="mt-5 border-t border-[var(--line)] pt-4 text-[13px] text-fg-muted">
            {pendingClaim ? "You've reported a payment. We're checking it now." : statusMeta[order.status].customerHint}
          </p>
        )}
      </Card>

      {order.status === "completed" && screeningOrder && screening && (
        <ScreeningReport order={order} file={file} result={screening} />
      )}
      {order.status === "completed" && !screeningOrder && refinement && (
        <RefinementResult orderId={order.id} original={order.source_text} revised={refinement.revised_text} notes={refinement.reviewer_notes} />
      )}

      {unpaid && (
        <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
          {confirmingCard ? (
            <Card strong className="noise overflow-hidden p-5 sm:p-7">
              <WaitingAnimation
                title="Card payment received — confirming it"
                steps={["Waiting for Stripe's confirmation", "Adding your order to the queue"]}
                stepMs={2200}
                note="This usually takes a few seconds. The page updates by itself."
              />
              <AutoRefresh every={5_000} className="relative mt-5" />
              <p className="relative mt-4 text-center text-[12px] text-fg-subtle">
                Still waiting after a few minutes?{" "}
                <Link href={`/orders/${order.id}`} className="underline hover:text-fg">
                  Show payment options
                </Link>{" "}
                or contact support. Please don&rsquo;t pay twice.
              </p>
            </Card>
          ) : pendingClaim ? (
            <Card strong className="noise overflow-hidden p-5 sm:p-7">
              <div aria-hidden className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-warn/10 blur-3xl" />
              <WaitingAnimation
                title="Payment submitted — we're confirming it"
                steps={[
                  `Checking our ${manualPayments[pendingClaim.method].label} account`,
                  `Matching reference ${reference}`,
                  "Your order joins the queue once it's confirmed",
                ]}
                stepMs={2200}
                note="We check each payment by hand. You can leave this page open or come back later; it updates by itself."
              />
              <dl className="relative mx-auto mt-2 grid max-w-md gap-x-6 gap-y-3 rounded-xl border border-[var(--line)] bg-ink-900/40 p-4 text-[13px] sm:grid-cols-2">
                <div><dt className="text-fg-subtle">Method</dt><dd className="mt-0.5">{manualPayments[pendingClaim.method].label}</dd></div>
                <div><dt className="text-fg-subtle">Amount</dt><dd className="mt-0.5">{formatCredits(pendingClaim.amount)}</dd></div>
                <div className="min-w-0"><dt className="text-fg-subtle">Your reference</dt><dd className="mt-0.5 truncate">{pendingClaim.payer_reference}</dd></div>
                <div><dt className="text-fg-subtle">Submitted</dt><dd className="mt-0.5">{formatDateTime(pendingClaim.created_at)}</dd></div>
              </dl>
              <AutoRefresh every={20_000} className="relative mt-5" />
            </Card>
          ) : (
            <Card strong className="p-5 sm:p-7">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold">Payment</h2>
                  <p className="mt-1 text-[13px] text-fg-muted">Your order joins the queue as soon as you pay.</p>
                </div>
                <p className="text-right">
                  <span className="text-gradient text-3xl font-semibold tracking-tight">{formatCredits(order.price)}</span>
                  <span className="block font-mono text-[11.5px] text-fg-subtle">Order #{shortId(order.id)}</span>
                </p>
              </div>
              {rejectedClaim && (
                <div className="mt-5">
                  <FormMessage>
                    We couldn&rsquo;t match your {manualPayments[rejectedClaim.method].label} payment
                    {rejectedClaim.reviewed_at ? ` (checked ${formatDateTime(rejectedClaim.reviewed_at)})` : ""}.
                    {rejectedClaim.admin_note ? ` ${rejectedClaim.admin_note}` : " Please check the details and submit again, or contact support."}
                  </FormMessage>
                </div>
              )}
              <div className="mt-6">
                <CreditPayPanel
                  orderId={order.id}
                  price={toCredits(order.price)}
                  balance={balance}
                  suggestedUsd={suggestedUsd}
                  devPayments={devPaymentsEnabled()}
                />
              </div>
            </Card>
          )}
          <div className="space-y-5">
            <OrderDetails order={order} file={file} payments={payments} />
            <p className="flex gap-2 px-1 text-[12px] leading-relaxed text-fg-subtle">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Orders are paid with credits. Top up on the Billing &amp; Credits page, then come back to pay.
            </p>
          </div>
        </div>
      )}

      {inProgress && (
        <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
          <Card strong className="noise overflow-hidden p-5 sm:p-7">
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-accent/15 blur-3xl" />
            <WaitingAnimation
              title={screeningOrder ? "Your report is being prepared" : "Your refinement is in progress"}
              steps={
                screeningOrder
                  ? [
                      statusMeta[order.status].customerHint,
                      "Screening runs with repository storage off",
                      "Only values the screening returned are shown",
                      "The result appears on this page",
                    ]
                  : [
                      statusMeta[order.status].customerHint,
                      "Clarity, flow and style, in your own voice",
                      "Your meaning and citations are kept",
                      "The revision appears on this page",
                    ]
              }
              stepMs={2600}
              note="A person handles every order, so timing depends on the queue. You can close this page: the result appears here, and in Orders, as soon as it's released."
            />
            <AutoRefresh every={60_000} className="relative mt-2" />
          </Card>
          <OrderDetails order={order} file={file} payments={payments} />
        </div>
      )}

      {order.status === "cancelled" && <OrderDetails order={order} file={file} payments={payments} />}
    </>
  );
}
