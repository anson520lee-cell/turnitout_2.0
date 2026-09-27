import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScreeningInput, ScreeningJob, ScreeningProvider, ScreeningResult } from "./types";

/**
 * Human-in-the-loop provider. "Creating" a screening just places the paid
 * order in the admin queue; an authorised admin performs the screening
 * outside this application and records exactly what it returned.
 *
 * This class deliberately has no network access to Turnitin and never
 * handles Turnitin credentials. The job id is the order id.
 */
export class ManualTurnitinProvider implements ScreeningProvider {
  readonly id = "turnitin";
  readonly displayName = "Turnitin";
  readonly manual = true;

  async createScreening(input: ScreeningInput): Promise<ScreeningJob> {
    const db = createAdminClient();
    await db
      .from("orders")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("id", input.orderId)
      .eq("status", "paid");
    return { jobId: input.orderId, provider: this.id, state: "pending_manual" };
  }

  async getResult(jobId: string): Promise<ScreeningResult | null> {
    const db = createAdminClient();
    const { data } = await db
      .from("screening_results")
      .select("*")
      .eq("order_id", jobId)
      .maybeSingle();
    if (!data) return null;
    return {
      provider: data.provider,
      aiIndicator: data.ai_indicator === null ? null : Number(data.ai_indicator),
      aiIndicatorNote: data.ai_indicator_note,
      similarityPercentage:
        data.similarity_percentage === null ? null : Number(data.similarity_percentage),
      completedAt: data.screening_completed_at,
      reportPath: data.report_storage_path,
      reportFileName: data.report_file_name,
    };
  }
}
