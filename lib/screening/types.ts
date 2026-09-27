import type { ScreeningServiceType } from "@/config/pricing";

export interface ScreeningInput {
  orderId: string;
  serviceType: ScreeningServiceType;
  documentPath: string;
  fileName: string;
}

export type ScreeningJobState = "pending_manual" | "in_progress" | "complete" | "failed";

export interface ScreeningJob {
  jobId: string;
  provider: string;
  state: ScreeningJobState;
}

export interface ScreeningResult {
  provider: string;
  /** Null when the screening did not return an AI-writing indicator. Never estimated. */
  aiIndicator: number | null;
  aiIndicatorNote: string | null;
  /** Null when the screening did not return a similarity value. Never estimated. */
  similarityPercentage: number | null;
  completedAt: string | null;
  reportPath: string | null;
  reportFileName: string | null;
}

/**
 * Anything that can screen a document. The order system and the customer UI
 * depend only on this interface, so the manual workflow can be replaced by an
 * officially authorised integration later without touching the frontend.
 */
export interface ScreeningProvider {
  readonly id: string;
  readonly displayName: string;
  /** Manual providers need a person to perform the screening. */
  readonly manual: boolean;
  createScreening(input: ScreeningInput): Promise<ScreeningJob>;
  getResult(jobId: string): Promise<ScreeningResult | null>;
}
