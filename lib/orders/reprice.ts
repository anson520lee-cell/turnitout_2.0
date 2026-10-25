import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { billableChars, refinementPrice, reportPrice } from "@/config/pricing";
import { isScreening } from "@/lib/orders/status";
import type { Order } from "@/types/domain";

/**
 * An unpaid order keeps the price it was created with. When prices change, an
 * order made earlier would still ask for the old price, so every unpaid order
 * is re-priced from its own text against the current price list before it is
 * shown or paid. Orders that are paid, free (price 0), or have no stored text
 * (old file uploads) are left alone.
 */
export function currentPriceOf(order: Pick<Order, "service_type" | "source_text" | "status" | "price">): number | null {
  if (order.status !== "awaiting_payment" || order.price <= 0 || !order.source_text) return null;
  const chars = billableChars(order.source_text);
  if (order.service_type === "refinement") return refinementPrice(chars);
  return isScreening(order.service_type) ? reportPrice(chars) : null;
}

export async function repriceUnpaid<T extends Order>(order: T): Promise<T> {
  const price = currentPriceOf(order);
  if (price === null || price === order.price) return order;
  const db = createAdminClient();
  const { data } = await db
    .from("orders")
    .update({ price, updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "awaiting_payment")
    .select("id");
  return data?.length ? { ...order, price } : order;
}
