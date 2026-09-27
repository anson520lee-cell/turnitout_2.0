import type { ServiceType } from "@/config/pricing";
import type { OrderStatus } from "@/lib/orders/status";
import type { AnalysisResult, RiskLevel } from "@/lib/scanning/types";

export type UserRole = "user" | "admin";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  service_type: ServiceType;
  status: OrderStatus;
  title: string;
  price: number;
  currency: string;
  word_count: number | null;
  instructions: string | null;
  source_text: string | null;
  admin_checklist: AdminChecklist;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  source_deleted_at: string | null;
}

export interface AdminChecklist {
  /** Screening run with repository storage disabled ("no repository"). */
  no_repository_confirmed?: boolean;
  no_repository_confirmed_at?: string;
  /** Document removed from the external screening workspace after download. */
  external_copy_removed?: boolean;
}

export interface OrderFile {
  id: string;
  order_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  verified: boolean;
  created_at: string;
}

export interface ScreeningResultRow {
  id: string;
  order_id: string;
  provider: string;
  ai_indicator: number | null;
  ai_indicator_note: string | null;
  similarity_percentage: number | null;
  screening_completed_at: string | null;
  report_storage_path: string | null;
  report_file_name: string | null;
  result_metadata: Record<string, unknown>;
  admin_notes: string | null;
}

export interface RefinementResultRow {
  id: string;
  order_id: string;
  revised_text: string;
  reviewer_notes: string | null;
}

export interface ScanResultRow {
  id: string;
  user_id: string;
  word_count: number;
  overall_risk: RiskLevel;
  result_json: AnalysisResult;
  analyzer: string;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface AdminNote {
  id: string;
  order_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}
