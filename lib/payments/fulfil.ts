import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getScreeningProvider } from "@/lib/screening";
import { audit } from "@/lib/audit";
import { isScreening } from "@/lib/orders/status";
import type { Order } from "@/types/domain";

/**
 * Marks an order paid after a VERIFIED payment and hands it to the queue.
 * Idempotent: repeated webhook deliveries are harmless.
 */
export async function markOrderPaid(args: {
  orderId: string;
  provider: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
}): Promise<{ ok: boolean; reason?: string }> {
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

  if (order.status !== "awaiting_payment") return { ok: true };

  const now = new Date().toISOString();
  await db
    .from("orders")
    .update({ status: "paid", paid_at: now, updated_at: now })
    .eq("id", order.id)
    .eq("status", "awaiting_payment");
  await audit("order_paid", { orderId: order.id, detail: { provider: args.provider } });

  if (isScreening(order.service_type)) {
    const file = await db
      .from("order_files")
      .select("storage_path,file_name")
      .eq("order_id", order.id)
      .maybeSingle();
    await getScreeningProvider().createScreening({
      orderId: order.id,
      serviceType: order.service_type as never,
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
  return { ok: true };
}
