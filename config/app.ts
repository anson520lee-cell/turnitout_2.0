/**
 * Central brand + product configuration.
 * Rename the product by editing `brand` only; nothing else hard-codes the name.
 */
export const brand = {
  name: "Proofline",
  tagline: "Know before you submit.",
  description:
    "Preliminary writing scans, human-processed AI and similarity screening, and clarity review for genuine student writing.",
  supportEmail: "support@proofline.example",
  // Legal operator name shown in terms/privacy. Replace before launch.
  operator: "Proofline (operator name TBC)",
  jurisdiction: "Hong Kong SAR",
} as const;

export const freeScan = {
  /** Must match `v_limit` in supabase/migrations/0001_init.sql (consume_scan). */
  dailyLimit: 3,
  /** Calendar day boundary for the daily reset. Must match the SQL function. */
  timezone: "Asia/Hong_Kong",
  minWords: 80,
  maxWords: 3000,
  maxChars: 25000,
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
  /** Reports are kept this long so the user can re-download them. */
  reportDays: 90,
} as const;

export const refinement = {
  minChars: 200,
  maxChars: 60000,
  maxInstructionChars: 1000,
} as const;

export const features = {
  googleSignIn: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true",
} as const;
