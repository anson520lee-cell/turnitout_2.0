import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkReportRewrite } from "@/lib/auto-report/rewrite-check";
import { uuid } from "@/lib/validation/schemas";

/**
 * Re-checks a Writing Refinement for real (lib/auto-report/rewrite-check.ts): the text with every suggestion in place
 * is reviewed by the detector, once, at no extra charge. Asking again returns the saved re-check. Only the order's
 * owner (or an admin) can call it.
 */
export const maxDuration = 120;

const noStore = { "cache-control": "no-store" };

const messages = {
  no_rewrite: "There are no suggestions to re-check yet.",
  busy: "The rewritten text is already being re-checked. Give it a moment.",
  daily_limit: "Re-checks are paused for today because of high demand. Run a new report on your edited text instead.",
  unavailable: "We couldn't re-check the rewritten text just now. Please try again in a little while.",
} as const;

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/reports/[id]/rewrite/check">) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: noStore });
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  const { data: order } = await createAdminClient().from("orders").select("user_id").eq("id", id).maybeSingle<{ user_id: string }>();
  if (!order || (order.user_id !== user.id && user.profile.role !== "admin")) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  }
  const out = await checkReportRewrite(id, order.user_id);
  if (out.ok) return NextResponse.json({ check: out.check }, { headers: noStore });
  const status = out.reason === "busy" ? 409 : out.reason === "unavailable" ? 502 : 422;
  return NextResponse.json({ error: messages[out.reason], reason: out.reason }, { status, headers: noStore });
}
