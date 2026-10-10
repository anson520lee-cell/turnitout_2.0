import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { verifySignature, type PaymentPayload } from "@/lib/payments/nowpayments/core";
import { processPaymentUpdate } from "@/lib/payments/nowpayments";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOwner } from "@/lib/notify";
import { formatUSD } from "@/config/pricing";
import { shortId } from "@/lib/utils";

/**
 * NOWPayments IPN (webhook). The ONLY way, besides our own server-side status
 * check against the NOWPayments API, that a crypto payment can add credits.
 * Nothing the browser sends is trusted: the raw body must carry a valid
 * HMAC-SHA512 signature made with NOWPAYMENTS_IPN_SECRET.
 * Repeated deliveries are safe: credits are added by a single database
 * function that only works once per top-up.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return new NextResponse("Not configured", { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-nowpayments-sig"), secret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let payload: PaymentPayload;
  try {
    payload = JSON.parse(raw) as PaymentPayload;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const bodyHash = createHash("sha256").update(raw).digest("hex");
  const db = createAdminClient();
  const { data: seen } = await db.from("crypto_webhook_events").select("id").eq("body_hash", bodyHash).maybeSingle();
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  let res;
  try {
    res = await processPaymentUpdate(payload, "webhook");
  } catch (e) {
    console.error("[nowpayments] webhook processing failed", e instanceof Error ? e.message : e);
    return new NextResponse("Try again", { status: 500 }); // NOWPayments retries
  }
  if (!res.ok) {
    if (res.reason === "busy") return new NextResponse("Try again", { status: 500 });
    console.warn("[nowpayments] webhook rejected:", res.reason);
    return new NextResponse(res.reason === "unknown order" ? "Unknown order" : "Rejected", {
      status: res.reason === "unknown order" ? 404 : 400,
    });
  }

  await db
    .from("crypto_webhook_events")
    .upsert(
      { body_hash: bodyHash, np_payment_id: String(payload.payment_id ?? ""), status: payload.payment_status, outcome: res.credited ? "credited" : "recorded" },
      { onConflict: "body_hash", ignoreDuplicates: true },
    );

  if (res.credited) {
    notifyOwner("payment_confirmed", {
      topup: shortId(res.rec.topup_id),
      method: `Crypto (${payload.pay_currency ?? "NOWPayments"})`,
      amount: formatUSD(res.rec.usd),
    });
  } else if (res.flag === "underpaid") {
    notifyOwner("payment_submitted", {
      topup: shortId(res.rec.topup_id),
      method: `Crypto (${payload.pay_currency ?? "NOWPayments"})`,
      amount: formatUSD(res.rec.usd),
      action: "Customer paid LESS than required. No credits were added. Check the payment in NOWPayments.",
    });
  }
  return NextResponse.json({ received: true });
}
