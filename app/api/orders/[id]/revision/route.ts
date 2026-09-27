import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { uuid } from "@/lib/validation/schemas";

/** Downloads a completed refinement as plain text. RLS limits it to the owner. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/orders/[id]/revision">) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  if (!uuid.safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase
    .from("refinement_results")
    .select("revised_text,reviewer_notes")
    .eq("order_id", id)
    .maybeSingle();
  if (!data) return new NextResponse("Not found", { status: 404 });
  const body = data.reviewer_notes
    ? `${data.revised_text}\n\n---\nReviewer notes:\n${data.reviewer_notes}\n`
    : `${data.revised_text}\n`;
  return new NextResponse(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="revision-${id.slice(0, 8)}.txt"`,
      "cache-control": "private, no-store",
    },
  });
}
