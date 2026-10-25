/**
 * Central brand + product configuration.
 * Rename the product by editing `brand` only; nothing else hard-codes the name.
 */
export const brand = {
  name: "0%",
  tagline: "Know before you submit.",
  description:
    "Automatic AI-writing risk reports on your own text, and writing refinement of your own work.",
  supportEmail: "support@getzeropercent.com",
  // Operator name shown in the footer, terms and privacy.
  operator: "Zero Percent Labs",
  jurisdiction: "Hong Kong SAR",
} as const;

/**
 * The free full report: every account gets this many in total, once, ever
 * (not per day), with every effect and the whole report, for texts up to
 * maxChars. After that, reports are paid for with credits. The per-account
 * limit must match `consume_free_report` in
 * supabase/migrations/0019_one_free_report.sql.
 */
export const freeReport = {
  /** Free reports one account can ever take. */
  perUserLimit: 1,
  minChars: 500,
  maxChars: 4000,
  /** Free reports one network address may hand out a Hong Kong day (accounts made on the fly share it). */
  perNetworkLimit: 3,
} as const;

export const uploads = {
  maxBytes: 20 * 1024 * 1024,
  allowedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  allowedExtensions: [".pdf", ".docx"],
  documentsBucket: "documents",
  reportsBucket: "reports",
  reportMaxBytes: 30 * 1024 * 1024,
  /** Seconds a signed download URL stays valid. */
  signedUrlTtl: 60,
} as const;

export const retention = {
  /**
   * Source documents for completed/cancelled orders are deleted this many days
   * after completion by /api/cron/retention (see README > Retention).
   */
  sourceDocumentDays: 14,
  /**
   * Unpaid orders with no reported payment are cancelled after this many
   * days, and their pasted text and uploads deleted at once.
   */
  unpaidOrderDays: 7,
  /** Reports are kept this long so the user can re-download them. */
  reportDays: 90,
  /** A written report saved from the old free scan is deleted this many days after saving. */
  savedReportDays: 90,
} as const;

export const refinement = {
  minChars: 200,
  maxChars: 60000,
  maxInstructionChars: 1000,
} as const;

/**
 * The owner's local writing model (Open WebUI on the owner's computer), used
 * through the worker in tools/local-model-worker. Everything here is off until
 * MODEL_WORKER_SECRET is set; see README > Local writing model.
 */
export const localModel = {
  /** A first draft for each paid refinement order, for an admin to review and edit. */
  refinementDrafts: true,
  /** The worker counts as online if it checked in within this many seconds. */
  onlineWindowSeconds: 45,
  /** A draft the worker hasn't picked up by then is marked failed; request another from the order page. */
  draftDays: 14,
  /** Longest output accepted from the worker, in characters. */
  maxFeedbackChars: 6000,
  maxDraftChars: 90000,
} as const;

export const features = {
  googleSignIn: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true",
} as const;
