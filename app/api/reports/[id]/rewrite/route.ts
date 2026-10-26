import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeRewrite } from "@/lib/auto-report/rewrite-run";
import { uuid } from "@/lib/validation/schemas";

/**
 * Makes the suggested rewrites for a finished report, once; asking again returns the saved ones. Only the order's
 * owner (or an admin) can call it.
 */
export const maxDuration = 120;

const noStore = { "cache-control": "no-store" };

const messages = {
  no_report: "This report isn't finished yet.",
  nothing_flagged: "No sentences were flagged, so there is nothing to rewrite.",
  busy: "The suggestions are already being written. Give it a moment.",
  daily_limit: "Suggestions are paused for today because of high demand. Please try again tomorrow.",
  unavailable: "We couldn't write the suggestions just now. Please try again in a little while.",
} as const;

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/reports/[id]/rewrite">) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: noStore });
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  const { data: order } = await createAdminClient().from("orders").select("user_id").eq("id", id).maybeSingle<{ user_id: string }>();
  if (!order || (order.user_id !== user.id && user.profile.role !== "admin")) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  }
  const out = await makeRewrite(id);
  if (out.ok) return NextResponse.json({ rewrite: out.rewrite }, { headers: noStore });
  return NextResponse.json({ error: messages[out.reason], reason: out.reason }, { status: out.reason === "busy" ? 409 : out.reason === "unavailable" ? 502 : 422, headers: noStore });
}
