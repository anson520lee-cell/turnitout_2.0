/**
 * Central brand + product configuration.
 * Rename the product by editing `brand` only; nothing else hard-codes the name.
 */
export const brand = {
  name: "0%",
  tagline: "Know before you submit.",
  description:
    "Preliminary writing scans, AI and similarity reports from a Turnitin screening run by our team, and writing refinement of your own work.",
  supportEmail: "support@zeropercent.example",
  // Legal operator name shown in terms/privacy. Replace before launch.
  operator: "0% (operator name TBC)",
  jurisdiction: "Hong Kong SAR",
} as const;

export const freeScan = {
  /** Must match `v_limit` in supabase/migrations/0001_init.sql (consume_scan). */
  dailyLimit: 3,
  /** Calendar day boundary for the daily reset. Must match the SQL function. */
  timezone: "Asia/Hong_Kong",
  /** Character count, not word count: CJK text has no spaces to split words on. */
  minChars: 500,
  maxChars: 2000,
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
   * Store the full text of free scans? Off by default: only the analysis
   * result (signal scores) is stored.
   */
  storeScanText: false,
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
  /** Written feedback under a free scan, while the worker is online. */
  scanFeedback: true,
  /** A first draft for each paid refinement order, for an admin to review and edit. */
  refinementDrafts: true,
  /** The worker counts as online if it checked in within this many seconds. */
  onlineWindowSeconds: 45,
  /** Scan feedback not ready and shown within this is dropped, text and all. */
  scanFeedbackMinutes: 10,
  /** Skip scan feedback while this many are already waiting: they wouldn't be ready in time. */
  maxQueuedFeedback: 5,
  /** A draft the worker hasn't picked up by then is marked failed; request another from the order page. */
  draftDays: 14,
  /** Longest output accepted from the worker, in characters. */
  maxFeedbackChars: 6000,
  maxDraftChars: 90000,
} as const;

export const features = {
  googleSignIn: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true",
} as const;
