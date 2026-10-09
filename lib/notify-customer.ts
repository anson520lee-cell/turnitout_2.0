import "server-only";
import { after } from "next/server";
import { brand } from "@/config/app";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/utils";

/**
 * Emails to customers: their credits arrived, their report or refinement is
 * ready. Sent through Resend, and only once a sender on our own domain is set
 * (`NOTIFY_EMAIL_FROM`, verified in Resend): Resend's shared test sender can
 * only write to the account owner. Like the owner alerts, messages carry the
 * order number, service and amounts, never document text or file names.
 * Failures are logged and never block the action that triggered them.
 */

export type CustomerEvent = "credits_added" | "order_paid" | "order_completed";

type Fields = Record<string, string | number | undefined>;

function compose(event: CustomerEvent, f: Fields): { subject: string; text: string } {
  const site = appUrl();
  const sign = `\n\n— ${brand.name}\n${site}`;
  switch (event) {
    case "credits_added":
      return {
        subject: `${f.credits} credits added to your account`,
        text: `Your payment (${f.amount}, ${f.method}) is confirmed and ${f.credits} credits are in your balance.\n\nSee your balance: ${site}/billing${sign}`,
      };
    case "order_paid":
      return {
        subject: `Order ${f.order}: payment confirmed`,
        text: `We've confirmed your payment for order ${f.order} (${f.service}). It's in the queue now; we'll email you when it's ready.\n\nFollow it here: ${site}/orders/${f.id}${sign}`,
      };
    case "order_completed":
      return {
        subject: `Order ${f.order} is ready`,
        text: `Your ${f.service} for order ${f.order} is ready to open.\n\nOpen it here: ${site}/orders/${f.id}${sign}`,
      };
  }
}

export function customerEmailsEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_FROM) && process.env.CUSTOMER_EMAILS !== "false";
}

async function emailOfUser(userId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle<{ email: string }>();
  return data?.email ?? null;
}

/** Queue an email to the customer who owns `userId`. Safe to call from server actions. */
export function notifyCustomer(userId: string, event: CustomerEvent, fields: Fields = {}): void {
  if (!customerEmailsEnabled()) return;
  const send = async () => {
    try {
      const to = await emailOfUser(userId);
      if (!to) return;
      const { subject, text } = compose(event, fields);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: process.env.NOTIFY_EMAIL_FROM, to: [to], subject, text }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}`);
    } catch (e) {
      console.error("[notify-customer]", event, e instanceof Error ? e.message : e);
    }
  };
  try {
    after(send);
  } catch {
    void send();
  }
}
