"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/payments/stripe";
import { isStripeConfigured } from "@/lib/env";
import { acceptsClaims, claimReference, isCryptoMethod, MANUAL_PAYMENT_METHODS, manualPayments } from "@/config/payments";
import { formatUSD, topUp, topUpAmountError, topUpCurrency, usdToCredits } from "@/config/pricing";
import { audit } from "@/lib/audit";
import { notifyOwner } from "@/lib/notify";
import { appUrl, shortId } from "@/lib/utils";
import { autoConfirmTopup, isAutoMethod } from "@/lib/payments/stable-topups";

type Fail = { ok: false; message: string };

const MAX_OPEN_TOPUPS = 5;

/** Whole-dollar amount rules: presets for every method, any amount (min US$5) for crypto. */
function amountProblem(usd: number, custom: boolean): string | null {
  const base = topUpAmountError(usd);
  if (base) return base;
  if (!custom && !(topUp.presetsUsd as readonly number[]).includes(usd)) {
    return `Choose one of ${topUp.presetsUsd.map(formatUSD).join(", ")}, or pay with crypto to enter your own amount.`;
  }
  return null;
}

async function tooManyOpen(userId: string): Promise<boolean> {
  const db = createAdminClient();
  const { count } = await db
    .from("credit_topups")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["pending"]);
  return (count ?? 0) >= MAX_OPEN_TOPUPS;
}

/** Card / Google Pay: creates the top-up row and a Stripe Checkout Session in US dollars. */
export async function startTopupCheckout(usd: number): Promise<Fail> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const problem = amountProblem(Number(usd), false);
  if (problem) return { ok: false, message: problem };
  if (!isStripeConfigured()) return { ok: false, message: "Card payment isn't available yet. Please use another method." };

  const db = createAdminClient();
  const credits = usdToCredits(usd);
  const { data: row, error } = await db
    .from("credit_topups")
    .insert({ user_id: user.id, usd, amount: credits, method: "stripe", status: "awaiting_payment" })
    .select("id")
    .single();
  if (error || !row) return { ok: false, message: "We couldn't start the top-up. Please try again." };

  let url: string | null = null;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: row.id,
      metadata: { topup_id: row.id },
      payment_intent_data: { metadata: { topup_id: row.id } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: topUpCurrency,
            unit_amount: usd * 100,
            product_data: { name: `${credits.toLocaleString("en-US")} credits`, description: `Top-up ${shortId(row.id)}` },
          },
        },
      ],
      success_url: `${appUrl()}/billing?checkout=success`,
      cancel_url: `${appUrl()}/billing?checkout=cancelled`,
    });
    url = session.url;
    await audit("topup_checkout_started", { actorId: user.id, detail: { topup: row.id, usd } });
  } catch {
    await db.from("credit_topups").update({ status: "cancelled" }).eq("id", row.id);
    return { ok: false, message: "We couldn't start checkout. Please try again in a moment." };
  }
  if (!url) return { ok: false, message: "Checkout is unavailable right now." };
  redirect(url);
}

const claimInput = z.object({
  usd: z.number(),
  method: z.enum(MANUAL_PAYMENT_METHODS, { message: "Choose how you paid." }),
  reference: z
    .string()
    .trim()
    .min(claimReference.min, "Enter your payment reference so we can find your payment.")
    .max(claimReference.max, `Keep the reference under ${claimReference.max} characters.`),
});

/**
 * PayPal / USDT / USDC / Bitcoin: the customer has paid outside the site and
 * reports the reference. USDT (TRON) and USDC (Base) are checked on chain at
 * once and credited if the transfer matches (lib/payments/stable-topups);
 * everything else, and anything that doesn't match yet, waits for an admin.
 */
export async function submitTopupClaim(usd: number, method: string, reference: string): Promise<{ ok: true; credited?: boolean } | Fail> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const parsed = claimInput.safeParse({ usd: Number(usd), method, reference });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the payment details." };
  const v = parsed.data;
  const cfg = manualPayments[v.method];
  if (!acceptsClaims(cfg)) return { ok: false, message: "That payment method isn't available right now." };
  const problem = amountProblem(v.usd, isCryptoMethod(v.method));
  if (problem) return { ok: false, message: problem };
  if (await tooManyOpen(user.id)) {
    return { ok: false, message: `You already have ${MAX_OPEN_TOPUPS} top-ups waiting to be confirmed. Please wait for those first.` };
  }

  const db = createAdminClient();
  const { data: row, error } = await db
    .from("credit_topups")
    .insert({
      user_id: user.id,
      usd: v.usd,
      amount: usdToCredits(v.usd),
      method: v.method,
      status: "pending",
      payer_reference: v.reference,
    })
    .select("id,created_at")
    .single();
  if (error || !row) return { ok: false, message: "We couldn't record your payment details. Please try again." };

  if (isAutoMethod(v.method)) {
    const r = await autoConfirmTopup({
      id: row.id,
      user_id: user.id,
      usd: v.usd,
      amount: usdToCredits(v.usd),
      method: v.method,
      status: "pending",
      payer_reference: v.reference,
      created_at: row.created_at,
    });
    if (r.status === "ok") {
      revalidatePath("/billing");
      return { ok: true, credited: true };
    }
  }

  await audit("topup_claim_submitted", { actorId: user.id, detail: { topup: row.id, method: v.method, usd: v.usd } });
  notifyOwner("payment_submitted", {
    topup: shortId(row.id),
    method: cfg.label,
    amount: formatUSD(v.usd),
    credits: usdToCredits(v.usd),
    email: user.email,
  });
  revalidatePath("/billing");
  return { ok: true };
}
