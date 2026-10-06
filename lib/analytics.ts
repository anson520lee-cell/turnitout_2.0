/**
 * Privacy-safe analytics hook. Events carry ids and enums only; never
 * document text, file names or titles. Wire `send` to a provider (e.g.
 * Plausible, PostHog with autocapture off) when one is chosen.
 */
export type AnalyticsEvent =
  | "signup_completed"
  | "login_completed"
  | "scan_dialog_opened"
  | "scan_started"
  | "scan_completed"
  | "scan_limit_reached"
  | "scan_report_downloaded"
  | "scan_feedback_shown"
  | "screening_service_clicked"
  | "refinement_service_clicked"
  | "order_created"
  | "checkout_started"
  | "credits_pay_clicked"
  | "topup_claim_submitted"
  | "topup_checkout_started"
  | "payment_claim_submitted"
  | "payment_completed"
  | "report_opened"
  | "report_downloaded";

type Props = Record<string, string | number | boolean | null>;

export function track(event: AnalyticsEvent, props: Props = {}): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event, props);
  }
  // send(event, props)  <- plug provider here
}
