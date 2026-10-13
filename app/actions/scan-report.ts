"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { higherLevel, type DialLevel } from "@/lib/report-format";
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

/**
 * The detailed review can read higher than the statistics, and the result page shows the
 * higher one. This stores that same level so the history agrees with what was on screen.
 * It only ever raises the level, only on the signed-in user's own scan, and the table's
 * column permissions only allow report edits, so the server's own client does the write.
 */
export async function raiseScanLevel(scanId: unknown, level: unknown): Promise<Result> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  if (!uuid.safeParse(scanId).success) return { ok: false, message: "This scan can't be found." };
  if (level !== "moderate" && level !== "elevated") return { ok: false, message: "Nothing to update." };
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("scan_results")
      .select("overall_risk")
      .eq("id", scanId as string)
      .eq("user_id", user.id)
      .maybeSingle<{ overall_risk: DialLevel }>();
    if (!data) return { ok: false, message: "This scan can't be found." };
    if (higherLevel(data.overall_risk, level as DialLevel) === data.overall_risk) return { ok: true };
    const { error } = await admin
      .from("scan_results")
      .update({ overall_risk: level })
      .eq("id", scanId as string)
      .eq("user_id", user.id);
    if (error) return { ok: false, message: "Couldn't update the history." };
  } catch {
    return { ok: false, message: "Couldn't update the history." };
  }
  revalidatePath("/scan/history");
  revalidatePath("/dashboard");
  return { ok: true };
}
