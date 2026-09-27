"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { canTransition, isScreening, type OrderStatus, ORDER_STATUSES } from "@/lib/orders/status";
import { claimReviewInput, screeningResultInput, uuid } from "@/lib/validation/schemas";
import { safeFileName, sniff } from "@/lib/storage/files";
import { markOrderPaid } from "@/lib/payments/fulfil";
import { notifyOwner } from "@/lib/notify";
import { uploads } from "@/config/app";
import { formatHKD } from "@/config/pricing";
import { manualPayments } from "@/config/payments";
import { serviceLabels } from "@/config/services";
import { shortId } from "@/lib/utils";
import type { AdminChecklist, Order, PaymentClaim } from "@/types/domain";

type Result = { ok: true } | { ok: false; message: string };

async function loadOrder(orderId: string): Promise<Order | null> {
  if (!uuid.safeParse(orderId).success) return null;
  const db = createAdminClient();
  const { data } = await db.from("orders").select("*").eq("id", orderId).maybeSingle<Order>();
  return data;
}

function refresh(orderId: string) {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath(`/orders/${orderId}`);
}

async function loadClaim(claimId: string): Promise<PaymentClaim | null> {
  const db = createAdminClient();
  const { data } = await db.from("payment_claims").select("*").eq("id", claimId).maybeSingle<PaymentClaim>();
  return data;
}

async function customerEmail(userId: string): Promise<string | undefined> {
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle<{ email: string }>();
  return data?.email;
}

/**
 * The admin has found the customer's Alipay / PayMe / bank payment. Claims the
 * review first (pending → confirmed, conditionally, so two admins can't both
 * confirm), then records the payment through the same markOrderPaid path as
 * Stripe. If that fails, the claim goes back to pending.
 */
export async function confirmPaymentClaim(input: unknown): Promise<Result> {
  const admin = await assertAdmin();
  const parsed = claimReviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  const claim = await loadClaim(parsed.data.claimId);
  if (!claim) return { ok: false, message: "Payment claim not found." };
  if (claim.status !== "pending") return { ok: false, message: "This claim has already been reviewed." };
  const order = await loadOrder(claim.order_id);
  if (!order) return { ok: false, message: "Order not found." };
  if (order.status !== "awaiting_payment") {
    return {
      ok: false,
      message: `This order is ${order.status.replace(/_/g, " ")}, not awaiting payment. Reject the claim instead and refund the customer if they paid twice.`,
    };
  }
  if (claim.amount !== order.price) {
    return { ok: false, message: `The claim is for ${formatHKD(claim.amount)} but the order costs ${formatHKD(order.price)}. Reject it and ask the customer to resubmit.` };
  }

  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data: taken } = await db
    .from("payment_claims")
    .update({ status: "confirmed", reviewed_by: admin.id, reviewed_at: now, admin_note: parsed.data.note || null })
    .eq("id", claim.id)
    .eq("status", "pending")
    .select("id");
  if (!taken?.length) return { ok: false, message: "This claim has already been reviewed." };

  const res = await markOrderPaid({
    orderId: order.id,
    provider: claim.method,
    providerPaymentId: claim.id,
    amount: order.price,
    currency: order.currency,
  });
  if (!res.ok) {
    await db
      .from("payment_claims")
      .update({ status: "pending", reviewed_by: null, reviewed_at: null, admin_note: null })
      .eq("id", claim.id);
    return { ok: false, message: `Couldn't mark the order paid (${res.reason ?? "unknown error"}). The claim is still pending.` };
  }
  if (!res.newlyPaid) {
    // The order was paid another way (a card payment) between the check above
    // and now. Undo this claim's payment record and reject it, so it isn't
    // counted as a second payment the business kept.
    await db.from("payments").delete().eq("provider", claim.method).eq("provider_payment_id", claim.id);
    await db
      .from("payment_claims")
      .update({ status: "rejected", admin_note: "Order was already paid by another method" })
      .eq("id", claim.id);
    await audit("payment_claim_rejected", { actorId: admin.id, orderId: order.id, detail: { claim: claim.id, reason: "already_paid" } });
    refresh(order.id);
    const label = manualPayments[claim.method]?.label ?? claim.method;
    return {
      ok: false,
      message: `The order was paid by another method while you were confirming, so this claim was rejected. If the customer also paid by ${label}, refund that payment.`,
    };
  }

  await audit("payment_claim_confirmed", { actorId: admin.id, orderId: order.id, detail: { claim: claim.id, method: claim.method } });
  notifyOwner("payment_confirmed", {
    order: shortId(order.id),
    service: serviceLabels[order.service_type],
    method: manualPayments[claim.method]?.label ?? claim.method,
    amount: formatHKD(order.price),
    email: await customerEmail(order.user_id),
  });
  refresh(order.id);
  return { ok: true };
}

/**
 * The payment couldn't be found or doesn't match. The order stays
 * awaiting_payment and the customer can submit a new claim. The optional
 * note is shown to the customer.
 */
export async function rejectPaymentClaim(input: unknown): Promise<Result> {
  const admin = await assertAdmin();
  const parsed = claimReviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  const claim = await loadClaim(parsed.data.claimId);
  if (!claim) return { ok: false, message: "Payment claim not found." };
  if (claim.status !== "pending") return { ok: false, message: "This claim has already been reviewed." };

  const db = createAdminClient();
  const { data: done } = await db
    .from("payment_claims")
    .update({
      status: "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: parsed.data.note || null,
    })
    .eq("id", claim.id)
    .eq("status", "pending")
    .select("id");
  if (!done?.length) return { ok: false, message: "This claim has already been reviewed." };

  await audit("payment_claim_rejected", { actorId: admin.id, orderId: claim.order_id, detail: { claim: claim.id, method: claim.method } });
  notifyOwner("payment_rejected", {
    order: shortId(claim.order_id),
    method: manualPayments[claim.method]?.label ?? claim.method,
    amount: formatHKD(claim.amount),
    email: await customerEmail(claim.user_id),
  });
  refresh(claim.order_id);
  return { ok: true };
}

export async function updateOrderStatus(orderId: string, to: string): Promise<Result> {
  const admin = await assertAdmin();
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, message: "Order not found." };
  if (!(ORDER_STATUSES as readonly string[]).includes(to)) return { ok: false, message: "Unknown status." };
  const target = to as OrderStatus;
  if (!canTransition(order.service_type, order.status, target)) {
    return { ok: false, message: `Can't move from ${order.status} to ${target}.` };
  }

  const db = createAdminClient();
  const checklist = order.admin_checklist ?? {};

  // Gates for the screening workflow.
  if (isScreening(order.service_type)) {
    if (target === "screening" && !checklist.no_repository_confirmed) {
      return {
        ok: false,
        message: "Confirm the screening is set to “no repository” before starting.",
      };
    }
    if (target === "report_ready" || target === "completed") {
      const { data: res } = await db
        .from("screening_results")
        .select("ai_indicator,similarity_percentage,ai_indicator_note,report_storage_path,screening_completed_at")
        .eq("order_id", order.id)
        .maybeSingle();
      if (!res || !res.screening_completed_at) {
        return { ok: false, message: "Record the screening result first." };
      }
      const wantsAi = order.service_type !== "similarity_screening";
      const wantsSim = order.service_type !== "ai_screening";
      if (wantsAi && res.ai_indicator === null && !res.ai_indicator_note) {
        return { ok: false, message: "Enter the AI-writing indicator, or a note explaining why it was not returned." };
      }
      if (wantsSim && res.similarity_percentage === null && !res.report_storage_path) {
        return { ok: false, message: "Enter the similarity result or upload the report." };
      }
    }
  } else if (target === "completed") {
    const { data: res } = await db.from("refinement_results").select("id").eq("order_id", order.id).maybeSingle();
    if (!res) return { ok: false, message: "Save the revised text first." };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: target, updated_at: now };
  if (target === "completed") patch.completed_at = now;
  if (target === "cancelled") patch.cancelled_at = now;

  const { error } = await db.from("orders").update(patch).eq("id", order.id).eq("status", order.status);
  if (error) return { ok: false, message: "Update failed. Refresh and try again." };
  if (target === "cancelled") {
    // A cancelled order can't be paid: close any claim still waiting for review.
    await db
      .from("payment_claims")
      .update({ status: "rejected", reviewed_by: admin.id, reviewed_at: now, admin_note: "Order cancelled." })
      .eq("order_id", order.id)
      .eq("status", "pending");
  }
  await audit("status_changed", { actorId: admin.id, orderId: order.id, detail: { from: order.status, to: target } });
  refresh(order.id);
  return { ok: true };
}

const checklistInput = z.object({
  orderId: uuid,
  no_repository_confirmed: z.boolean(),
  external_copy_removed: z.boolean(),
});

export async function saveChecklist(input: unknown): Promise<Result> {
  const admin = await assertAdmin();
  const v = checklistInput.safeParse(input);
  if (!v.success) return { ok: false, message: "Invalid checklist." };
  const order = await loadOrder(v.data.orderId);
  if (!order) return { ok: false, message: "Order not found." };
  const prev = order.admin_checklist ?? {};
  const next: AdminChecklist = {
    ...prev,
    no_repository_confirmed: v.data.no_repository_confirmed,
    no_repository_confirmed_at: v.data.no_repository_confirmed
      ? prev.no_repository_confirmed_at ?? new Date().toISOString()
      : undefined,
    external_copy_removed: v.data.external_copy_removed,
  };
  const db = createAdminClient();
  await db.from("orders").update({ admin_checklist: next, updated_at: new Date().toISOString() }).eq("id", order.id);
  await audit("checklist_updated", { actorId: admin.id, orderId: order.id, detail: next as Record<string, unknown> });
  refresh(order.id);
  return { ok: true };
}

/** Signed upload URL for a report file, scoped to this order. */
export async function getReportUploadUrl(
  orderId: string,
  fileName: string,
): Promise<{ ok: true; uploadUrl: string; path: string } | { ok: false; message: string }> {
  await assertAdmin();
  const order = await loadOrder(orderId);
  if (!order || !isScreening(order.service_type)) return { ok: false, message: "Order not found." };
  if (!/\.(pdf|docx)$/i.test(fileName)) return { ok: false, message: "Reports must be PDF or DOCX." };
  const path = `${order.user_id}/${order.id}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
  const db = createAdminClient();
  const { data, error } = await db.storage.from(uploads.reportsBucket).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "Couldn't prepare the upload." };
  return { ok: true, uploadUrl: data.signedUrl, path };
}

/**
 * Records exactly what the screening returned. Blank fields stay null; the
 * app never fills in a value that the screening did not provide.
 */
export async function saveScreeningResult(input: unknown, report?: { path: string; fileName: string }): Promise<Result> {
  const admin = await assertAdmin();
  const parsed = screeningResultInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid result." };
  const v = parsed.data;
  const order = await loadOrder(v.orderId);
  if (!order || !isScreening(order.service_type)) return { ok: false, message: "Order not found." };
  if (order.status === "completed" || order.status === "cancelled") {
    return { ok: false, message: "This order is closed." };
  }

  const db = createAdminClient();
  let reportPath: string | undefined;
  let reportName: string | undefined;
  if (report) {
    // The path must be one we issued for this order.
    if (!report.path.startsWith(`${order.user_id}/${order.id}/`)) return { ok: false, message: "Invalid report path." };
    const { data: blob } = await db.storage.from(uploads.reportsBucket).download(report.path);
    if (!blob) return { ok: false, message: "The report upload didn't arrive." };
    const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    if (!sniff(head)) {
      await db.storage.from(uploads.reportsBucket).remove([report.path]);
      return { ok: false, message: "The report file isn't a valid PDF or DOCX." };
    }
    reportPath = report.path;
    reportName = safeFileName(report.fileName);
  }

  const completedAt = new Date(v.screeningCompletedAt);
  if (Number.isNaN(completedAt.getTime())) return { ok: false, message: "Invalid screening date." };

  const wantsAi = order.service_type !== "similarity_screening";
  const wantsSim = order.service_type !== "ai_screening";
  const row: Record<string, unknown> = {
    order_id: order.id,
    provider: "turnitin",
    ai_indicator: wantsAi ? v.aiIndicator : null,
    ai_indicator_note: wantsAi ? v.aiIndicatorNote || null : null,
    similarity_percentage: wantsSim ? v.similarityPercentage : null,
    screening_completed_at: completedAt.toISOString(),
    admin_notes: v.adminNotes || null,
    updated_at: new Date().toISOString(),
  };
  if (reportPath) {
    row.report_storage_path = reportPath;
    row.report_file_name = reportName;
  }

  const { data: existing } = await db
    .from("screening_results")
    .select("report_storage_path")
    .eq("order_id", order.id)
    .maybeSingle();
  const { error } = await db.from("screening_results").upsert(row, { onConflict: "order_id" });
  if (error) return { ok: false, message: "Couldn't save the result." };
  if (reportPath && existing?.report_storage_path && existing.report_storage_path !== reportPath) {
    await db.storage.from(uploads.reportsBucket).remove([existing.report_storage_path]);
  }
  await audit("screening_result_recorded", {
    actorId: admin.id,
    orderId: order.id,
    detail: {
      ai: row.ai_indicator !== null,
      similarity: row.similarity_percentage !== null,
      report: Boolean(reportPath ?? existing?.report_storage_path),
    },
  });
  refresh(order.id);
  return { ok: true };
}

const refinementInput = z.object({
  orderId: uuid,
  revisedText: z.string().trim().min(1, "Enter the revised text.").max(60000),
  reviewerNotes: z.string().trim().max(4000).optional().default(""),
});

export async function saveRefinementResult(input: unknown): Promise<Result> {
  const admin = await assertAdmin();
  const v = refinementInput.safeParse(input);
  if (!v.success) return { ok: false, message: v.error.issues[0]?.message ?? "Invalid input." };
  const order = await loadOrder(v.data.orderId);
  if (!order || order.service_type !== "refinement") return { ok: false, message: "Order not found." };
  const db = createAdminClient();
  const { error } = await db.from("refinement_results").upsert(
    {
      order_id: order.id,
      revised_text: v.data.revisedText,
      reviewer_notes: v.data.reviewerNotes || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "order_id" },
  );
  if (error) return { ok: false, message: "Couldn't save." };
  await audit("refinement_saved", { actorId: admin.id, orderId: order.id });
  refresh(order.id);
  return { ok: true };
}

export async function addAdminNote(orderId: string, body: string): Promise<Result> {
  const admin = await assertAdmin();
  const text = body.trim();
  if (!text || text.length > 4000) return { ok: false, message: "Note must be 1–4000 characters." };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, message: "Order not found." };
  const db = createAdminClient();
  await db.from("admin_notes").insert({ order_id: order.id, author_id: admin.id, body: text });
  refresh(order.id);
  return { ok: true };
}

/** Updates the word count for PDFs, where the server can't count reliably. */
export async function setWordCount(orderId: string, words: number): Promise<Result> {
  await assertAdmin();
  if (!Number.isInteger(words) || words < 0 || words > 200000) return { ok: false, message: "Invalid word count." };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, message: "Order not found." };
  const db = createAdminClient();
  await db.from("orders").update({ word_count: words }).eq("id", order.id);
  refresh(order.id);
  return { ok: true };
}
