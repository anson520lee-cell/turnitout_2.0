import type { ServiceType } from "@/config/pricing";

/**
 * Single source of truth for order states. Every label, tone, allowed
 * transition and "visible to customer" rule lives here.
 */
export const ORDER_STATUSES = [
  "awaiting_payment",
  "paid",
  "queued",
  "under_review",
  "processing",
  "screening",
  "report_ready",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type StatusTone = "neutral" | "info" | "progress" | "success" | "danger";

export const statusMeta: Record<
  OrderStatus,
  { label: string; tone: StatusTone; customerHint: string }
> = {
  awaiting_payment: {
    label: "Awaiting payment",
    tone: "neutral",
    customerHint: "Pay below to place this order in the queue.",
  },
  paid: {
    label: "Paid",
    tone: "info",
    customerHint: "Payment confirmed. Your order is entering the queue.",
  },
  queued: {
    label: "Queued",
    tone: "info",
    customerHint: "Waiting for a reviewer to pick it up.",
  },
  under_review: {
    label: "Under review",
    tone: "progress",
    customerHint: "A reviewer is reading your text.",
  },
  processing: {
    label: "Processing",
    tone: "progress",
    customerHint: "Your revision is being prepared.",
  },
  screening: {
    label: "Screening",
    tone: "progress",
    customerHint: "Your document is being screened.",
  },
  report_ready: {
    label: "Report ready",
    tone: "progress",
    customerHint: "The result has been recorded and is being checked before release.",
  },
  completed: {
    label: "Completed",
    tone: "success",
    customerHint: "Your result is ready.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "danger",
    customerHint: "This order was cancelled.",
  },
};

const screeningFlow: OrderStatus[] = [
  "awaiting_payment",
  "paid",
  "queued",
  "screening",
  "report_ready",
  "completed",
];

const refinementFlow: OrderStatus[] = [
  "awaiting_payment",
  "paid",
  "queued",
  "under_review",
  "processing",
  "completed",
];

export function isScreening(type: ServiceType): boolean {
  return type !== "refinement";
}

export function flowFor(type: ServiceType): OrderStatus[] {
  return isScreening(type) ? screeningFlow : refinementFlow;
}

/**
 * Transitions an admin may make by hand. "paid" is only ever set by
 * markOrderPaid: from the verified Stripe webhook, from an admin confirming a
 * manual payment claim (Alipay / PayMe / bank transfer), or from the dev-only
 * payment switch. Never by a status form.
 */
export function nextStatuses(type: ServiceType, current: OrderStatus): OrderStatus[] {
  if (current === "completed" || current === "cancelled") return [];
  const flow = flowFor(type);
  const idx = flow.indexOf(current);
  const next: OrderStatus[] = [];
  if (idx >= 0 && idx < flow.length - 1 && current !== "awaiting_payment") {
    next.push(flow[idx + 1]);
  }
  next.push("cancelled");
  return next;
}

export function canTransition(
  type: ServiceType,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return nextStatuses(type, from).includes(to);
}

export function stepIndex(type: ServiceType, status: OrderStatus): number {
  return flowFor(type).indexOf(status);
}

export const ACTIVE_STATUSES: OrderStatus[] = [
  "paid",
  "queued",
  "under_review",
  "processing",
  "screening",
  "report_ready",
];
