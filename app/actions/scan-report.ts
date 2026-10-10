"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/schemas";

type Result = { ok: true } | { ok: false; message: string };

/** The longest report the site ever produces is cut at 16,000 characters. */
const MAX_REPORT_CHARS = 16_000;

/**
 * Keeps the written report with a scan in the signed-in user's history. Opt-in:
 * nothing is saved unless the user presses the button. Row-level security means
 * a user can only change their own scans, and only the report columns.
 */
export async function saveScanReport(scanId: unknown, report: unknown): Promise<Result> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in to save a report." };
  if (!uuid.safeParse(scanId).success) return { ok: false, message: "This scan can't be found." };
  if (typeof report !== "string" || report.trim().length < 20 || report.length > MAX_REPORT_CHARS) {
    return { ok: false, message: "There is no report to save yet." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scan_results")
    .update({ report_text: report.trim(), report_saved_at: new Date().toISOString() })
    .eq("id", scanId as string)
    .eq("user_id", user.id)
    .select("id");
  if (error || !data?.length) return { ok: false, message: "Couldn't save the report. Please try again." };
  revalidatePath("/scan/history");
  return { ok: true };
}

/** Removes a saved report (the scan's scores stay). */
export async function deleteScanReport(scanId: unknown): Promise<Result> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  if (!uuid.safeParse(scanId).success) return { ok: false, message: "This scan can't be found." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("scan_results")
    .update({ report_text: null, report_saved_at: null })
    .eq("id", scanId as string)
    .eq("user_id", user.id);
  if (error) return { ok: false, message: "Couldn't delete the report. Please try again." };
  revalidatePath("/scan/history");
  revalidatePath("/scan");
  return { ok: true };
}
