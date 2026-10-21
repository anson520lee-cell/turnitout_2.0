import { retention } from "@/config/app";

/**
 * The privacy and retention wording shown around the site (privacy policy, FAQ, settings, landing page, scan
 * pages). It is written once here so the pages cannot drift apart again: change a window in `retention` or a
 * sentence below and every page follows.
 */

/** Who can read a stored report or text. Staff access is real, so it is always said. */
export const whoCanSee = "Only you and authorised staff can see it.";

/** The note beside a written report the user chose to save. */
export const savedReportNote = `${whoCanSee} Deleted ${retention.savedReportDays} days after saving, or sooner if you delete it.`;

export const retentionSentence = {
  /** Pasted text and uploaded documents of an order. */
  source: `Submitted text and uploaded documents are deleted ${retention.sourceDocumentDays} days after an order completes or is cancelled.`,
  reports: `Reports are deleted ${retention.reportDays} days after completion.`,
  unpaid: `Unpaid orders are cancelled, and their text deleted, after ${retention.unpaidOrderDays} days.`,
  freeScan: retention.storeScanText
    ? "The text of a free scan is stored with your scan history."
    : "The text of a free scan is not stored; only its scores are kept.",
} as const;
