import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { REASONING_EFFORTS, deepseekEnabled } from "@/lib/deepseek";
import { runChunkPiece } from "@/lib/chunk-run";
import { uuid } from "@/lib/validation/schemas";

/**
 * Chunk-size experiment (admin only): runs the reviewer on one piece of one
 * sample and keeps the answer. A route, not a server action, because server
 * actions run one at a time and the page runs several pieces at once.
 */

export const maxDuration = 120;

const noStore = { "cache-control": "no-store" };
const body = z.object({
  sampleId: uuid,
  size: z.number().int().min(300).max(20_000),
  idx: z.number().int().min(0).max(200),
  batch: z.string().min(1).max(60),
  effort: z.enum(REASONING_EFFORTS).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.profile.role !== "admin") return NextResponse.json({ ok: false, message: "Not authorised." }, { status: 403, headers: noStore });
  if (!deepseekEnabled()) return NextResponse.json({ ok: false, message: "DEEPSEEK_API_KEY isn't set in Vercel." }, { headers: noStore });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400, headers: noStore });
  return NextResponse.json(await runChunkPiece(parsed.data), { headers: noStore });
}
