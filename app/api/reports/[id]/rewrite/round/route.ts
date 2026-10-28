import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeRound } from "@/lib/auto-report/rewrite-run";
import { uuid } from "@/lib/validation/schemas";

/**
 * One more round of Writing Refinement (lib/auto-report/rewrite-run.ts makeRound): the sentences the last re-check
 * still counts are rewritten again, at no extra charge, and wait for the re-check (rewrite/check) to keep or drop them.
 * When no round is needed the saved rewrite comes back as it is. Only the order's owner (or an admin) can call it.
 */
export const maxDuration = 120;

const noStore = { "cache-control": "no-store" };

const messages = {
  no_rewrite: "There are no suggestions to rewrite again yet.",
  busy: "Your text is already being rewritten or re-checked. Give it a moment.",
  daily_limit: "Further rounds are paused for today because of high demand. Your best round so far is kept.",
  unavailable: "We couldn't run another round just now. Your best round so far is kept.",
} as const;

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/reports/[id]/rewrite/round">) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: noStore });
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  const { data: order } = await createAdminClient().from("orders").select("user_id").eq("id", id).maybeSingle<{ user_id: string }>();
  if (!order || (order.user_id !== user.id && user.profile.role !== "admin")) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  }
  const out = await makeRound(id);
  if (out.ok) return NextResponse.json({ rewrite: out.rewrite }, { headers: noStore });
  const status = out.reason === "busy" ? 409 : out.reason === "unavailable" ? 502 : 422;
  return NextResponse.json({ error: messages[out.reason], reason: out.reason }, { status, headers: noStore });
}
