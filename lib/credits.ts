import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Credit reads. They use the signed-in user's session, so row-level security
 * returns only that user's rows. All writes go through the SQL functions
 * (credit_add / credit_spend / ...) called with the service role from server
 * actions; a browser can never change a balance.
 */

export interface CreditTransaction {
  id: string;
  delta: number;
  balance_after: number;
  kind: "topup" | "spend" | "refund" | "adjustment";
  order_id: string | null;
  note: string | null;
  created_at: string;
}

export type TopupStatus = "awaiting_payment" | "pending" | "confirmed" | "rejected" | "cancelled";

export interface CreditTopup {
  id: string;
  usd: number;
  amount: number;
  method: string;
  status: TopupStatus;
  payer_reference: string | null;
  admin_note: string | null;
  created_at: string;
  confirmed_at: string | null;
}

/** Current balance in credits. 0 when the account has never had credits (or the table is unreachable). */
export async function getCreditBalance(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("credit_accounts").select("balance").maybeSingle<{ balance: number }>();
    return data?.balance ?? 0;
  } catch {
    return 0;
  }
}

export async function listCreditTransactions(limit = 30): Promise<CreditTransaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_transactions")
    .select("id,delta,balance_after,kind,order_id,note,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CreditTransaction[];
}

export async function listCreditTopups(limit = 20): Promise<CreditTopup[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_topups")
    .select("id,usd,amount,method,status,payer_reference,admin_note,created_at,confirmed_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CreditTopup[];
}
