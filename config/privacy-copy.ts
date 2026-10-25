import { retention } from "@/config/app";

/**
 * The privacy and retention wording shown around the site (privacy policy, FAQ, settings, landing page). It is written once here so the pages cannot drift apart again: change a window in `retention` or a
 * sentence below and every page follows.
 */

/** Who can read a stored report or text. Staff access is real, so it is always said. */
export const whoCanSee = "Only you and authorised staff can see it.";

export const retentionSentence = {
  /** Pasted text and uploaded documents of an order. */
  source: `Submitted text and uploaded documents are deleted ${retention.sourceDocumentDays} days after an order completes or is cancelled.`,
  reports: `Reports are deleted ${retention.reportDays} days after completion.`,
  unpaid: `Unpaid orders are cancelled, and their text deleted, after ${retention.unpaidOrderDays} days.`,
  /** Results of the preliminary scan, which the site no longer offers; they stay until the account owner deletes them. */
  earlierScans: "Scores from earlier preliminary scans stay in your account until you delete them in Settings. The text you scanned was not stored.",
} as const;
