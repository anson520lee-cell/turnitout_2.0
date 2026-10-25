"use server";

import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuid } from "@/lib/validation/schemas";

/**
 * The submitted text of one order, for the activity table. Admin only; every view is written to the audit log
 * (the privacy policy says file access is recorded). Only orders have any.
 */
export async function viewOrderText(orderId: unknown): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const admin = await assertAdmin();
  const id = uuid.safeParse(orderId);
  if (!id.success) return { ok: false, message: "Unknown order." };
  const { data } = await createAdminClient().from("orders").select("source_text").eq("id", id.data).maybeSingle<{ source_text: string | null }>();
  if (!data?.source_text) return { ok: false, message: "This text is no longer stored (deleted under the retention policy)." };
  await audit("admin_viewed_text", { actorId: admin.id, orderId: id.data, detail: { via: "activity" } });
  return { ok: true, text: data.source_text };
}
