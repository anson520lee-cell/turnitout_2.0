/** What /api/scan-feedback/[id] answers while the scan page polls it. */
export type ScanFeedbackStatus =
  | { status: "queued" | "running" }
  | { status: "done"; feedback: string }
  | { status: "unavailable" };

/** Whether the worker on the owner's computer has checked in recently. */
export type WorkerStatus = { online: boolean; lastSeenAt: string | null; model: string | null };

/** A refinement order's latest model draft, as the admin page shows it. */
export type DraftJob = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  output_text: string | null;
  error: string | null;
  model: string | null;
  attempts: number;
  created_at: string;
  finished_at: string | null;
};
