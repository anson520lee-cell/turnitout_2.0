import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceAutoReport } from "@/lib/auto-report/run";
import { uuid } from "@/lib/validation/schemas";

/**
 * Moves an automatic report forward. The order page calls this again and again
 * while the report is being made; each call reviews some more pieces and says how
 * far it got. Only the order's owner (or an admin) can call it.
 */
export const maxDuration = 120;

const noStore = { "cache-control": "no-store" };

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/reports/[id]/advance">) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: noStore });
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  const { data: order } = await createAdminClient().from("orders").select("user_id").eq("id", id).maybeSingle<{ user_id: string }>();
  if (!order || (order.user_id !== user.id && user.profile.role !== "admin")) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  }
  return NextResponse.json(await advanceAutoReport(id), { headers: noStore });
}
