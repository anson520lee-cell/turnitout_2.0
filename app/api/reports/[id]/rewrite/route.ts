import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeRewrite, type RewriteOutcome } from "@/lib/auto-report/rewrite-run";
import { uuid } from "@/lib/validation/schemas";

/**
 * Makes the suggested rewrites (Writing Refinement, paid in credits) for a finished report, once; asking again returns
 * the saved ones without charging. Only the order's owner (or an admin) can call it; the order's owner pays.
 *
 * With `?stream=1` the answer is newline-delimited JSON, so the live rewrite can show each suggestion as soon as it is
 * written: `{"item": …}` lines as they come in, then one `{"rewrite": …}` or `{"error": …, "reason": …}` line. The
 * suggestions are still saved and charged for only once all are in, exactly as without it.
 */
export const maxDuration = 120;

const noStore = { "cache-control": "no-store" };

const messages = {
  no_report: "This report isn't finished yet.",
  nothing_flagged: "No sentences were flagged, so there is nothing to rewrite.",
  busy: "The suggestions are already being written. Give it a moment.",
  daily_limit: "Suggestions are paused for today because of high demand. Please try again tomorrow.",
  unavailable: "We couldn't write the suggestions just now. Nothing was charged. Please try again in a little while.",
  no_suggestions: "We couldn't make a safe suggestion for these sentences, so nothing was charged. Please rewrite them in your own words.",
} as const;

function failure(out: Exclude<RewriteOutcome, { ok: true }>) {
  if (out.reason === "insufficient") {
    return { body: { error: `Writing Refinement costs ${out.credits} credits and your balance is ${out.balance}. Top up on the Billing & Credits page.`, reason: out.reason }, status: 402 };
  }
  return { body: { error: messages[out.reason], reason: out.reason }, status: out.reason === "busy" ? 409 : out.reason === "unavailable" ? 502 : 422 };
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/reports/[id]/rewrite">) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: noStore });
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  const { data: order } = await createAdminClient().from("orders").select("user_id").eq("id", id).maybeSingle<{ user_id: string }>();
  if (!order || (order.user_id !== user.id && user.profile.role !== "admin")) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  }
  const who = { userId: order.user_id, admin: user.profile.role === "admin" };

  if (request.nextUrl.searchParams.get("stream") === "1") {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        // Some browsers hold a streamed answer until about 1 KB has arrived: start with a blank line that long.
        controller.enqueue(encoder.encode(`${" ".repeat(1_100)}\n`));
        try {
          const out = await makeRewrite(id, who, (item) => send({ item }));
          send(out.ok ? { rewrite: out.rewrite } : failure(out).body);
        } catch {
          send({ error: messages.unavailable, reason: "unavailable" });
        }
        controller.close();
      },
    });
    return new Response(body, { headers: { ...noStore, "content-type": "application/x-ndjson; charset=utf-8", "x-accel-buffering": "no" } });
  }

  const out = await makeRewrite(id, who);
  if (out.ok) return NextResponse.json({ rewrite: out.rewrite }, { headers: noStore });
  const { body, status } = failure(out);
  return NextResponse.json(body, { status, headers: noStore });
}
