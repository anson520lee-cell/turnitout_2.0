import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/payments/stripe";
import { markOrderPaid } from "@/lib/payments/fulfil";
import { notifyOwner } from "@/lib/notify";
import { formatHKD, formatUSD } from "@/config/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { serviceLabels } from "@/config/services";
import { shortId } from "@/lib/utils";

/**
 * The ONLY path by which a real order becomes "paid". The success redirect
 * from Checkout is never trusted; this handler verifies Stripe's signature.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new NextResponse("Not configured", { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;

    // Credit top-up: confirm it only when the paid amount matches what we set.
    const topupId = session.metadata?.topup_id;
    if (topupId) {
      if (session.payment_status !== "paid" || session.amount_total === null) return NextResponse.json({ received: true });
      const db = createAdminClient();
      const { data: top } = await db
        .from("credit_topups")
        .select("id,user_id,usd,amount,status")
        .eq("id", topupId)
        .maybeSingle<{ id: string; user_id: string; usd: number; amount: number; status: string }>();
      if (!top) return new NextResponse("Unknown top-up", { status: 404 });
      if (session.amount_total !== top.usd * 100 || (session.currency ?? "") !== "usd") {
        await audit("topup_amount_mismatch", { detail: { topup: top.id, expected: top.usd * 100, got: session.amount_total, currency: session.currency } });
        return NextResponse.json({ received: true });
      }
      const ref = (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id) ?? session.id;
      const { data: balance, error } = await db.rpc("credit_confirm_topup", { p_topup: top.id, p_reviewer: null, p_provider_ref: ref });
      // Let Stripe retry if the database write failed.
      if (error) return new NextResponse("Try again", { status: 500 });
      if (typeof balance === "number" && balance >= 0) {
        await audit("topup_confirmed", { detail: { topup: top.id, usd: top.usd, credits: top.amount, provider: "stripe" } });
        notifyOwner("payment_confirmed", {
          topup: shortId(top.id),
          method: "Card (Stripe)",
          amount: formatUSD(top.usd),
          credits: top.amount,
          email: session.customer_details?.email ?? session.customer_email ?? undefined,
        });
      }
      return NextResponse.json({ received: true });
    }

    const orderId = session.metadata?.order_id;
    if (orderId && session.payment_status === "paid" && session.amount_total !== null) {
      const res = await markOrderPaid({
        orderId,
        provider: "stripe",
        providerPaymentId: (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id) ?? session.id,
        amount: session.amount_total,
        currency: session.currency ?? "",
      });
      if (!res.ok && res.reason === "order not found") {
        return new NextResponse("Unknown order", { status: 404 });
      }
      // Let Stripe retry if the database write failed.
      if (!res.ok && res.reason === "update failed") {
        return new NextResponse("Try again", { status: 500 });
      }
      if (res.ok && res.newlyPaid && res.order) {
        notifyOwner("payment_confirmed", {
          order: shortId(res.order.id),
          service: serviceLabels[res.order.service_type],
          method: "Card (Stripe)",
          amount: formatHKD(res.order.price),
          email: session.customer_details?.email ?? session.customer_email ?? undefined,
        });
      } else if (res.ok && !res.newlyPaid && !res.duplicate && res.order) {
        // A new card payment for an order that was already paid another way
        // (a confirmed Alipay/PayMe/bank claim) or cancelled, e.g. through a
        // checkout tab left open. It is recorded; a person has to refund it.
        notifyOwner("payment_confirmed", {
          order: shortId(res.order.id),
          service: serviceLabels[res.order.service_type],
          method: "Card (Stripe)",
          amount: formatHKD(res.order.price),
          email: session.customer_details?.email ?? session.customer_email ?? undefined,
          action:
            res.order.status === "cancelled"
              ? "Order was cancelled before this payment arrived. Refund it in Stripe or contact the customer."
              : "Order was already paid by another method. This is a second payment: refund it in Stripe.",
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}

// Refinement drafts are written by DeepSeek after the response (lib/local-model/jobs.ts).
export const maxDuration = 300;
