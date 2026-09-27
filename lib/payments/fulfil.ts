import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getScreeningProvider } from "@/lib/screening";
import { audit } from "@/lib/audit";
import { isScreening } from "@/lib/orders/status";
import type { ScreeningServiceType } from "@/config/pricing";
import type { Order } from "@/types/domain";

/**
 * Marks an order paid after a VERIFIED payment and hands it to the queue.
 * Verified means: a signature-checked Stripe webhook, or an admin who has
 * checked the account and confirmed a manual payment claim (provider is then
 * "alipay" | "payme" | "bank_transfer" and providerPaymentId the claim id).
 *
 * Idempotent: repeated webhook deliveries are harmless. `newlyPaid` is true
 * only for the call that actually moved the order out of awaiting_payment,
 * so callers can notify once. `duplicate` is true when this exact payment
 * was already recorded (a redelivery). A payment that is new but finds the
 * order already paid or cancelled (`!newlyPaid && !duplicate`) is money the
 * customer paid twice or too late: callers must flag it for a refund.
 */
export async function markOrderPaid(args: {
  orderId: string;
  provider: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
}): Promise<{ ok: boolean; reason?: string; newlyPaid?: boolean; duplicate?: boolean; order?: Order }> {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq("id", args.orderId)
    .single<Order>();
  if (!order) return { ok: false, reason: "order not found" };

  // Never trust an amount we did not set: it must equal the server-side price.
  if (args.amount !== order.price || args.currency.toLowerCase() !== order.currency) {
    await audit("payment_amount_mismatch", {
      orderId: order.id,
      detail: { expected: order.price, got: args.amount, currency: args.currency },
    });
    return { ok: false, reason: "amount mismatch" };
  }

  const { data: existing } = await db
    .from("payments")
    .select("id")
    .eq("provider", args.provider)
    .eq("provider_payment_id", args.providerPaymentId)
    .maybeSingle();
  const duplicate = Boolean(existing);

  await db.from("payments").upsert(
    {
      order_id: order.id,
      provider: args.provider,
      provider_payment_id: args.providerPaymentId,
      amount: args.amount,
      currency: args.currency.toLowerCase(),
      status: "succeeded",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,provider_payment_id" },
  );

  if (order.status !== "awaiting_payment") {
    if (!duplicate) {
      await audit("payment_after_close", { orderId: order.id, detail: { provider: args.provider, status: order.status } });
    }
    return { ok: true, newlyPaid: false, duplicate, order };
  }

  const now = new Date().toISOString();
  const { data: moved, error } = await db
    .from("orders")
    .update({ status: "paid", paid_at: now, updated_at: now })
    .eq("id", order.id)
    .eq("status", "awaiting_payment")
    .select("id");
  if (error) return { ok: false, reason: "update failed" };
  // Another delivery (or another payment method) got here first.
  if (!moved?.length) return { ok: true, newlyPaid: false, duplicate, order };
  await audit("order_paid", { orderId: order.id, detail: { provider: args.provider } });

  if (isScreening(order.service_type)) {
    // Report requests are pasted text (orders.source_text) and have no file;
    // the manual provider only queues the order, so an empty path is fine.
    const file = await db
      .from("order_files")
      .select("storage_path,file_name")
      .eq("order_id", order.id)
      .maybeSingle();
    await getScreeningProvider().createScreening({
      orderId: order.id,
      serviceType: order.service_type as ScreeningServiceType,
      documentPath: file.data?.storage_path ?? "",
      fileName: file.data?.file_name ?? "",
    });
  } else {
    await db
      .from("orders")
      .update({ status: "queued", updated_at: now })
      .eq("id", order.id)
      .eq("status", "paid");
  }
  await audit("order_queued", { orderId: order.id });
  return { ok: true, newlyPaid: true, duplicate, order };
}
