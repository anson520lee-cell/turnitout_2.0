import type { Order } from "@/types/domain";
import type { CreditTopup, CreditTransaction } from "@/lib/credits";
import { reportPrice, toCredits, usdToCredits } from "@/config/pricing";

/**
 * Made-up account for the signed-in design preview (/preview/app). Nothing
 * here is read from or written to the database; every name, order and
 * amount is invented to show the layout.
 */
export const demoEmail = "student@example.com";
export const demoName = "Alex";

const at = (iso: string) => new Date(iso).toISOString();

function order(id: string, title: string, status: Order["status"], chars: number, created: string, more: Partial<Order> = {}): Order {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000000",
    service_type: "ai_screening",
    status,
    title,
    price: reportPrice(chars),
    currency: "hkd",
    word_count: Math.round(chars / 5.6),
    instructions: null,
    source_text: null,
    admin_checklist: {},
    created_at: at(created),
    updated_at: at(created),
    paid_at: status === "awaiting_payment" || status === "cancelled" ? null : at(created),
    completed_at: status === "completed" ? at(created) : null,
    cancelled_at: status === "cancelled" ? at(created) : null,
    source_deleted_at: null,
    ...more,
  };
}

export const demoOrders: Order[] = [
  order("c2d07a13-5e8b-4c1f-9a42-3b7d6e1f0a95", "Personal statement, draft 3", "awaiting_payment", 2600, "2026-11-22T16:20:00+08:00"),
  order("b81e44d0-2c6a-4f3e-8d15-9a0c7b2e4f61", "History coursework, section 2", "screening", 4100, "2026-11-22T14:05:00+08:00"),
  order("7f3a9c21-4b0e-4d8a-b6f2-1e5c9d3a7b08", "Sociology essay, final draft", "completed", 3200, "2026-11-21T09:40:00+08:00"),
  order("e19b5f6a-8d27-4a3c-9f0e-6b4d2c8a1e73", "Economics reflection", "completed", 1800, "2026-11-18T20:12:00+08:00"),
  order("4a6c8e02-9f1d-4b7a-a3e5-0c2b8d6f4e19", "Lab report, discussion section", "completed", 5200, "2026-11-12T11:31:00+08:00"),
  order("9d2f1b37-6a4c-4e8b-b0d2-5f7e3a1c9b46", "Literature review, chapter 1", "cancelled", 7400, "2026-11-03T08:55:00+08:00"),
];

export const demoPendingClaims = new Set<string>();

const spent = demoOrders.filter((o) => o.paid_at).map((o) => toCredits(o.price));
const topped = usdToCredits(20) + usdToCredits(10);
export const demoBalance = topped - spent.reduce((a, b) => a + b, 0);

export const demoTopups: CreditTopup[] = [
  { id: "t-2", usd: 10, amount: usdToCredits(10), method: "paypal", status: "confirmed", payer_reference: null, admin_note: null, created_at: at("2026-11-17T19:02:00+08:00"), confirmed_at: at("2026-11-17T19:02:00+08:00") },
  { id: "t-1", usd: 20, amount: usdToCredits(20), method: "alipay", status: "confirmed", payer_reference: null, admin_note: null, created_at: at("2026-11-02T21:47:00+08:00"), confirmed_at: at("2026-11-02T21:47:00+08:00") },
];

/** Newest first, with a running balance, the way the history lists them. */
export const demoTransactions: CreditTransaction[] = (() => {
  const events = [
    { kind: "topup" as const, delta: usdToCredits(20), note: null as string | null, created: at("2026-11-02T21:47:00+08:00") },
    { kind: "topup" as const, delta: usdToCredits(10), note: null as string | null, created: at("2026-11-17T19:02:00+08:00") },
    ...demoOrders.filter((o) => o.paid_at).map((o) => ({ kind: "spend" as const, delta: -toCredits(o.price), note: o.title as string | null, created: o.created_at })),
  ].sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
  let balance = 0;
  const rows = events.map((e, i) => {
    balance += e.delta;
    return { id: `tx-${i}`, delta: e.delta, balance_after: balance, kind: e.kind, order_id: null, note: e.note, created_at: e.created };
  });
  return rows.reverse();
})();

export const demoPath = {
  overview: "/preview/app",
  orders: "/preview/app/orders",
  order: (id: string) => `/preview/app/orders/${id}`,
  billing: "/preview/app/billing",
  settings: "/preview/app/settings",
};
