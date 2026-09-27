import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Append-only record of who did what to an order. Never include document text. */
export async function audit(
  event: string,
  opts: { actorId?: string | null; orderId?: string | null; detail?: Record<string, unknown> } = {},
) {
  const db = createAdminClient();
  await db.from("audit_events").insert({
    event,
    actor_id: opts.actorId ?? null,
    order_id: opts.orderId ?? null,
    detail: opts.detail ?? {},
  });
}
