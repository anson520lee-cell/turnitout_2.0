"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { notifyOwner } from "@/lib/notify";
import { paymentMethodLabel } from "@/config/payments";
import { formatUSD } from "@/config/pricing";
import { uuid } from "@/lib/validation/schemas";
import { shortId } from "@/lib/utils";

type Result = { ok: true } | { ok: false; message: string };

interface TopupRow {
  id: string;
  user_id: string;
  usd: number;
  amount: number;
  method: string;
  status: string;
}

async function loadTopup(id: string): Promise<TopupRow | null> {
  if (!uuid.safeParse(id).success) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("credit_topups")
    .select("id,user_id,usd,amount,method,status")
    .eq("id", id)
    .maybeSingle<TopupRow>();
  return data;
}

async function emailOf(userId: string): Promise<string | undefined> {
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle<{ email: string }>();
  return data?.email;
}

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/billing");
}

/** The admin found the payment: credit the account (one transaction, safe to call twice). */
export async function confirmTopup(topupId: string): Promise<Result> {
  const admin = await assertAdmin();
  const top = await loadTopup(topupId);
  if (!top) return { ok: false, message: "Top-up not found." };
  if (top.status !== "pending" && top.status !== "awaiting_payment") return { ok: false, message: "This top-up has already been handled." };
  const db = createAdminClient();
  const { data, error } = await db.rpc("credit_confirm_topup", { p_topup: top.id, p_reviewer: admin.id, p_provider_ref: null });
  if (error) return { ok: false, message: "Couldn't add the credits. Nothing was changed; try again." };
  if (typeof data === "number" && data < 0) return { ok: false, message: "This top-up has already been handled." };
  await audit("topup_confirmed", { actorId: admin.id, detail: { topup: top.id, usd: top.usd, credits: top.amount } });
  notifyOwner("payment_confirmed", {
    topup: shortId(top.id),
    method: paymentMethodLabel(top.method),
    amount: formatUSD(top.usd),
    credits: top.amount,
    email: await emailOf(top.user_id),
  });
  refresh();
  return { ok: true };
}

export async function rejectTopup(topupId: string, note: string): Promise<Result> {
  const admin = await assertAdmin();
  const top = await loadTopup(topupId);
  if (!top) return { ok: false, message: "Top-up not found." };
  const db = createAdminClient();
  const { data } = await db
    .from("credit_topups")
    .update({ status: "rejected", reviewed_by: admin.id, admin_note: note.trim().slice(0, 500) || null })
    .eq("id", top.id)
    .eq("status", "pending")
    .select("id");
  if (!data?.length) return { ok: false, message: "This top-up has already been handled." };
  await audit("topup_rejected", { actorId: admin.id, detail: { topup: top.id } });
  notifyOwner("payment_rejected", {
    topup: shortId(top.id),
    method: paymentMethodLabel(top.method),
    amount: formatUSD(top.usd),
    email: await emailOf(top.user_id),
  });
  refresh();
  return { ok: true };
}

const adjustInput = z.object({
  userId: z.string().uuid(),
  delta: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= 1_000_000, "Enter a non-zero whole number of credits."),
  note: z.string().trim().min(1, "Add a short note.").max(200),
});

/** Manual correction (e.g. a refund, a gift). Positive adds, negative removes; never below zero. */
export async function adjustCredits(input: unknown): Promise<Result> {
  const admin = await assertAdmin();
  const parsed = adjustInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  const v = parsed.data;
  const db = createAdminClient();
  const { data, error } = await db.rpc("credit_adjust", { p_user: v.userId, p_delta: v.delta, p_note: v.note });
  if (error) return { ok: false, message: "Couldn't adjust the balance." };
  if (typeof data === "number" && data < 0) return { ok: false, message: "That would take the balance below zero." };
  await audit("credits_adjusted", { actorId: admin.id, detail: { user: v.userId, delta: v.delta, note: v.note } });
  refresh();
  return { ok: true };
}
