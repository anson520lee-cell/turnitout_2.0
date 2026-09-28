import "server-only";
import { after } from "next/server";
import { brand } from "@/config/app";

/**
 * Tells the site owner when something happens: a free scan, a new order, a
 * payment reported or confirmed. Sent by Telegram and/or email, whichever is
 * configured. Runs after the response with `after()`, so it never slows the
 * user down. Order and payment messages are retried once; a failed send is
 * then logged and dropped.
 *
 * Free-scan messages go to Telegram only, one per scan. Anyone can trigger a
 * scan without an account, so per-scan emails could use up the daily sending
 * quota (Resend's free plan allows 100 a day) that payment alerts depend on.
 * Email gets one daily summary of free scans instead (`scan_digest`, sent by
 * the retention job).
 *
 * Never put document text, file names or titles in `fields`. Ids, amounts,
 * counts, methods and the account email are fine.
 */

export type OwnerEvent =
  | "scan_used"
  | "scan_digest"
  | "order_created"
  | "payment_submitted"
  | "payment_confirmed"
  | "payment_rejected"
  | "draft_ready";

const TITLES: Record<OwnerEvent, string> = {
  scan_used: "Free scan used",
  scan_digest: "Free scans yesterday",
  order_created: "New order",
  payment_submitted: "Payment reported, please check your account",
  payment_confirmed: "Payment confirmed",
  payment_rejected: "Payment claim rejected",
  draft_ready: "Model draft ready to review",
};

type Fields = Record<string, string | number | boolean | null | undefined>;

export function notificationChannels() {
  return {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    email: Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_TO),
    /** Free-scan messages: Telegram only, and on unless NOTIFY_ON_SCANS=false. */
    scans: process.env.NOTIFY_ON_SCANS !== "false",
  };
}

function format(event: OwnerEvent, fields: Fields): { subject: string; text: string } {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  const subject = `[${brand.name}] ${TITLES[event]}`;
  return { subject, text: [subject, "", ...lines].join("\n") };
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`telegram ${res.status}`);
}

async function sendEmail(subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!key || !to) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      // Resend's shared sender works without a verified domain for the account owner's own inbox.
      from: process.env.NOTIFY_EMAIL_FROM || `${brand.name} <onboarding@resend.dev>`,
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      text,
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

/** Queue a notification to the owner. Safe to call from server actions and route handlers. */
export function notifyOwner(event: OwnerEvent, fields: Fields = {}): void {
  const ch = notificationChannels();
  const scan = event === "scan_used";
  const digest = event === "scan_digest";
  if (scan && (!ch.scans || !ch.telegram)) return;
  if (digest && (!ch.scans || !ch.email)) return;
  if (!ch.telegram && !ch.email) return;
  const { subject, text } = format(event, fields);
  const attempt = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (first) {
      if (scan) throw first;
      await new Promise((r) => setTimeout(r, 1500));
      await fn();
    }
  };
  const send = async () => {
    const results = await Promise.allSettled([
      digest ? Promise.resolve() : attempt(() => sendTelegram(text)),
      scan ? Promise.resolve() : attempt(() => sendEmail(subject, text)),
    ]);
    for (const r of results) {
      if (r.status === "rejected") console.error("[notify]", event, r.reason instanceof Error ? r.reason.message : r.reason);
    }
  };
  try {
    after(send);
  } catch {
    // Outside a request scope (e.g. a script): send now, don't block on it.
    void send();
  }
}
