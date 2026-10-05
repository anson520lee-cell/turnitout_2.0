"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { billableChars, currency, formatHKD, refinementPrice, screeningPrice } from "@/config/pricing";
import { reportService, serviceLabels } from "@/config/services";
import { acceptsClaims, manualPayments } from "@/config/payments";
import { uploads } from "@/config/app";
import {
  paymentClaimInput,
  refinementOrderInput,
  screeningOrderInput,
  screeningTextOrderInput,
  uuid,
} from "@/lib/validation/schemas";
import { docxWordCount, extensionOk, safeFileName, sniff } from "@/lib/storage/files";
import { autoTitle } from "@/lib/orders/limits";
import { countWords, appUrl, shortId } from "@/lib/utils";
import { audit } from "@/lib/audit";
import { notifyOwner } from "@/lib/notify";
import { devPaymentsEnabled, isStripeConfigured, isSupabaseConfigured } from "@/lib/env";
import { stripe } from "@/lib/payments/stripe";
import { markOrderPaid } from "@/lib/payments/fulfil";
import type { Order } from "@/types/domain";

type Fail = { ok: false; message: string };

/** Guest submit message. Before accounts are connected, say so plainly instead of pointing at a sign-in that can't work yet. */
function signInMessage(): string {
  return isSupabaseConfigured
    ? "Please sign in or create a free account to submit this."
    : "Ordering opens as soon as accounts are connected. Nothing you pasted was sent or stored, so you can come back and paste it again.";
}

/** Unpaid orders one account may hold at once (keeps spam out of the owner's inbox). */
const MAX_UNPAID_ORDERS = 10;

async function tooManyUnpaid(userId: string): Promise<boolean> {
  const db = createAdminClient();
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "awaiting_payment");
  return (count ?? 0) >= MAX_UNPAID_ORDERS;
}

const TOO_MANY_UNPAID = `You have ${MAX_UNPAID_ORDERS} unpaid orders. Pay for or cancel some of them before creating another.`;

async function ownOrder(orderId: string, userId: string): Promise<Order | null> {
  if (!uuid.safeParse(orderId).success) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle<Order>();
  return data;
}

/**
 * Report request: the customer pastes their text and presses Enter. The
 * server re-checks the length, sets the price from config and creates an
 * unpaid order holding the text. Pressing Enter under the dialog's notice is
 * the customer's confirmation that they may submit the text.
 */
export async function createScreeningTextOrder(input: unknown): Promise<{ ok: true; orderId: string } | Fail> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: signInMessage() };
  const parsed = screeningTextOrderInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  if (await tooManyUnpaid(user.id)) return { ok: false, message: TOO_MANY_UNPAID };

  const text = parsed.data.text;
  const words = countWords(text);
  const price = screeningPrice(reportService);
  const db = createAdminClient();
  const { data: order, error } = await db
    .from("orders")
    .insert({
      user_id: user.id,
      service_type: reportService,
      title: autoTitle("Report", words, "words"),
      price,
      currency,
      word_count: words,
      source_text: text,
      integrity_confirmed: true,
    })
    .select("id")
    .single();
  if (error || !order) return { ok: false, message: "We couldn't create your report request. Please try again." };

  await audit("order_created", { actorId: user.id, orderId: order.id, detail: { service: reportService, words, source: "paste" } });
  notifyOwner("order_created", {
    order: shortId(order.id),
    service: serviceLabels[reportService],
    words,
    amount: formatHKD(price),
    email: user.email,
  });
  revalidatePath("/orders");
  return { ok: true, orderId: order.id };
}

/**
 * Legacy step 1 of a file-upload screening order: create the order and issue
 * a signed upload URL for exactly one path. The UI now uses
 * createScreeningTextOrder; this stays so older clients fail gracefully.
 */
export async function createScreeningOrder(input: unknown): Promise<
  { ok: true; orderId: string; uploadUrl: string } | Fail
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };

  const parsed = screeningOrderInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid order." };
  const v = parsed.data;
  if (await tooManyUnpaid(user.id)) return { ok: false, message: TOO_MANY_UNPAID };

  if (!extensionOk(v.fileName) || !(uploads.allowedMimeTypes as readonly string[]).includes(v.mimeType)) {
    return { ok: false, message: "Only PDF or DOCX files are accepted." };
  }
  if (v.fileSize > uploads.maxBytes) {
    return { ok: false, message: `That file is larger than ${uploads.maxBytes / 1024 / 1024} MB.` };
  }

  const db = createAdminClient();
  const { data: order, error } = await db
    .from("orders")
    .insert({
      user_id: user.id,
      service_type: v.serviceType,
      title: v.title,
      price: screeningPrice(v.serviceType),
      currency,
      instructions: v.notes || null,
      integrity_confirmed: true,
    })
    .select("id")
    .single();
  if (error || !order) return { ok: false, message: "We couldn't create the order. Please try again." };

  const path = `${user.id}/${order.id}/${crypto.randomUUID()}-${safeFileName(v.fileName)}`;
  const { data: signed, error: upErr } = await db.storage
    .from(uploads.documentsBucket)
    .createSignedUploadUrl(path);
  if (upErr || !signed) {
    await db.from("orders").delete().eq("id", order.id);
    return { ok: false, message: "We couldn't prepare the upload. Please try again." };
  }

  await db.from("order_files").insert({
    order_id: order.id,
    storage_path: path,
    file_name: safeFileName(v.fileName),
    mime_type: v.mimeType,
    file_size: v.fileSize,
  });
  await audit("order_created", { actorId: user.id, orderId: order.id, detail: { service: v.serviceType } });
  return { ok: true, orderId: order.id, uploadUrl: signed.signedUrl };
}

/**
 * Step 2: after the browser uploads, verify the stored object ourselves
 * (real size, magic bytes) and record the word count for DOCX.
 */
export async function confirmUpload(orderId: string): Promise<{ ok: true } | Fail> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const order = await ownOrder(orderId, user.id);
  if (!order || order.status !== "awaiting_payment") return { ok: false, message: "Order not found." };

  const db = createAdminClient();
  const { data: file } = await db
    .from("order_files")
    .select("*")
    .eq("order_id", order.id)
    .single();
  if (!file) return { ok: false, message: "Upload record missing." };

  const { data: blob, error } = await db.storage.from(uploads.documentsBucket).download(file.storage_path);
  if (error || !blob) return { ok: false, message: "The upload didn't arrive. Please try again." };

  const buf = Buffer.from(await blob.arrayBuffer());
  const kind = sniff(buf.subarray(0, 8));
  const expected = file.mime_type === "application/pdf" ? "pdf" : "docx";
  if (buf.length > uploads.maxBytes || kind !== expected) {
    await db.storage.from(uploads.documentsBucket).remove([file.storage_path]);
    await db.from("orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", order.id);
    return { ok: false, message: "That file doesn't look like a valid PDF or DOCX. Please export it again and retry." };
  }

  const words = kind === "docx" ? await docxWordCount(buf) : null;
  await db
    .from("order_files")
    .update({ file_size: buf.length, verified: true })
    .eq("id", file.id);
  await db.from("orders").update({ word_count: words, updated_at: new Date().toISOString() }).eq("id", order.id);
  return { ok: true };
}

/**
 * Writing Refinement: pasted text plus optional instructions. Priced by
 * billable characters on the server; the browser's estimate is display only.
 */
export async function createRefinementOrder(input: unknown): Promise<{ ok: true; orderId: string } | Fail> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: signInMessage() };
  const parsed = refinementOrderInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid order." };
  if (await tooManyUnpaid(user.id)) return { ok: false, message: TOO_MANY_UNPAID };
  const v = parsed.data;
  const words = countWords(v.text);
  const chars = billableChars(v.text);
  const price = refinementPrice(chars);

  const db = createAdminClient();
  const { data: order, error } = await db
    .from("orders")
    .insert({
      user_id: user.id,
      service_type: "refinement",
      title: autoTitle("Refinement", chars, "characters"),
      price,
      currency,
      word_count: words,
      instructions: v.instructions || null,
      source_text: v.text,
      integrity_confirmed: true,
    })
    .select("id")
    .single();
  if (error || !order) return { ok: false, message: "We couldn't create the order. Please try again." };
  await audit("order_created", { actorId: user.id, orderId: order.id, detail: { service: "refinement", words, chars } });
  notifyOwner("order_created", {
    order: shortId(order.id),
    service: serviceLabels.refinement,
    words,
    characters: chars,
    amount: formatHKD(price),
    email: user.email,
  });
  revalidatePath("/orders");
  return { ok: true, orderId: order.id };
}

/** Creates a Stripe Checkout Session from the stored order price and redirects. */
export async function startCheckout(orderId: string): Promise<Fail> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const order = await ownOrder(orderId, user.id);
  if (!order) return { ok: false, message: "Order not found." };
  if (order.status !== "awaiting_payment") return { ok: false, message: "This order has already been paid or closed." };
  // Report requests carry pasted text; only legacy file orders need a verified upload.
  if (order.service_type !== "refinement" && !order.source_text) {
    const db = createAdminClient();
    const { data: file } = await db.from("order_files").select("verified").eq("order_id", order.id).maybeSingle();
    if (!file?.verified) return { ok: false, message: "Your document hasn't finished uploading. Please upload it again." };
  }
  if (await hasPendingClaim(order.id)) {
    return { ok: false, message: "You've already reported a payment for this order. We're confirming it now." };
  }
  if (!isStripeConfigured()) {
    return { ok: false, message: "Online payment isn't configured yet. Please contact support to complete this order." };
  }

  let url: string | null = null;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: order.id,
      metadata: { order_id: order.id },
      payment_intent_data: { metadata: { order_id: order.id } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: order.currency,
            unit_amount: order.price,
            product_data: {
              name: serviceLabels[order.service_type],
              description: `Order ${shortId(order.id)}`,
            },
          },
        },
      ],
      success_url: `${appUrl()}/orders/${order.id}?checkout=success`,
      cancel_url: `${appUrl()}/orders/${order.id}?checkout=cancelled`,
    });
    url = session.url;
    await audit("checkout_started", { actorId: user.id, orderId: order.id });
  } catch {
    return { ok: false, message: "We couldn't start checkout. Please try again in a moment." };
  }
  if (!url) return { ok: false, message: "Checkout is unavailable right now." };
  redirect(url);
}

async function hasPendingClaim(orderId: string): Promise<boolean> {
  const db = createAdminClient();
  const { count } = await db
    .from("payment_claims")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .eq("status", "pending");
  return (count ?? 0) > 0;
}

/**
 * The customer says they have paid by Alipay, PayMe or bank transfer. This
 * only records the claim; the order stays awaiting_payment until an admin
 * finds the money and confirms it (confirmPaymentClaim in actions/admin.ts).
 */
export async function submitPaymentClaim(orderId: string, method: string, reference: string): Promise<{ ok: true } | Fail> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const parsed = paymentClaimInput.safeParse({ orderId, method, reference });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the payment details." };
  const v = parsed.data;
  if (!acceptsClaims(manualPayments[v.method])) return { ok: false, message: "That payment method isn't available right now." };

  const order = await ownOrder(v.orderId, user.id);
  if (!order) return { ok: false, message: "Order not found." };
  if (order.status !== "awaiting_payment") return { ok: false, message: "This order has already been paid or closed." };
  if (await hasPendingClaim(order.id)) {
    return { ok: false, message: "You've already reported a payment for this order. We're confirming it now." };
  }

  const db = createAdminClient();
  const { data: claim, error } = await db
    .from("payment_claims")
    .insert({
      order_id: order.id,
      user_id: user.id,
      method: v.method,
      payer_reference: v.reference,
      // Always the server-side price, never an amount from the browser.
      amount: order.price,
    })
    .select("id")
    .single();
  if (error || !claim) {
    // 23505: the one-pending-claim-per-order index caught a double submit.
    if (error?.code === "23505") return { ok: false, message: "You've already reported a payment for this order." };
    return { ok: false, message: "We couldn't record your payment details. Please try again." };
  }

  await audit("payment_claim_submitted", { actorId: user.id, orderId: order.id, detail: { claim: claim.id, method: v.method } });
  notifyOwner("payment_submitted", {
    order: shortId(order.id),
    service: serviceLabels[order.service_type],
    method: manualPayments[v.method].label,
    amount: formatHKD(order.price),
    email: user.email,
  });
  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/orders");
  return { ok: true };
}

/** Development only: simulate a verified payment. Disabled in production builds. */
export async function devMarkPaid(orderId: string): Promise<{ ok: true } | Fail> {
  if (!devPaymentsEnabled()) return { ok: false, message: "Not available." };
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const order = await ownOrder(orderId, user.id);
  if (!order) return { ok: false, message: "Order not found." };
  const res = await markOrderPaid({
    orderId: order.id,
    provider: "dev",
    providerPaymentId: `dev_${order.id}`,
    amount: order.price,
    currency: order.currency,
  });
  revalidatePath(`/orders/${order.id}`);
  return res.ok ? { ok: true } : { ok: false, message: res.reason ?? "Failed" };
}

export async function cancelUnpaidOrder(orderId: string): Promise<{ ok: true } | Fail> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const order = await ownOrder(orderId, user.id);
  if (!order || order.status !== "awaiting_payment") return { ok: false, message: "Only unpaid orders can be cancelled here." };
  if (await hasPendingClaim(order.id)) {
    return { ok: false, message: "You've reported a payment for this order, so it can't be cancelled here. Please contact support." };
  }
  const db = createAdminClient();
  const { data: files } = await db.from("order_files").select("storage_path").eq("order_id", order.id);
  if (files?.length) await db.storage.from(uploads.documentsBucket).remove(files.map((f) => f.storage_path));
  const now = new Date().toISOString();
  await db
    .from("orders")
    .update({ status: "cancelled", cancelled_at: now, source_deleted_at: files?.length ? now : null, source_text: null })
    .eq("id", order.id);
  await audit("order_cancelled_by_user", { actorId: user.id, orderId: order.id });
  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  return { ok: true };
}
