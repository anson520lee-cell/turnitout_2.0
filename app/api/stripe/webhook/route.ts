import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/payments/stripe";
import { markOrderPaid } from "@/lib/payments/fulfil";

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
    }
  }

  return NextResponse.json({ received: true });
}
