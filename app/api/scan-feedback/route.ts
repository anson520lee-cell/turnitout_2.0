import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DeepSeekError, deepseekChat, deepseekEnabled, redeemFeedbackTicket } from "@/lib/deepseek";
import { SCAN_REPORT_PROMPT } from "@/lib/local-model/prompts";
import { scanInput } from "@/lib/validation/schemas";

/**
 * Written feedback under a free scan. The scan action hands the browser a
 * signed ticket for that exact text; this route redeems it and asks DeepSeek.
 * The text is not stored or logged, and the provider's errors never reach the
 * browser.
 */

export const maxDuration = 60;

const body = z.object({ text: z.string().max(20_000), ticket: z.string().max(200) });
const noStore = { "cache-control": "no-store" };

export async function POST(request: NextRequest) {
  if (!deepseekEnabled()) return NextResponse.json({ error: "Feedback isn't available right now." }, { status: 503, headers: noStore });
  const parsed = body.safeParse(await request.json().catch(() => null));
  const text = parsed.success ? scanInput.safeParse(parsed.data.text) : null;
  if (!parsed.success || !text?.success) return NextResponse.json({ error: "Bad request." }, { status: 400, headers: noStore });
  if (!redeemFeedbackTicket(parsed.data.ticket, text.data)) {
    return NextResponse.json({ error: "This feedback request has expired." }, { status: 403, headers: noStore });
  }
  try {
    const feedback = await deepseekChat({
      system: SCAN_REPORT_PROMPT,
      user: `<draft>\n${text.data}\n</draft>`,
      maxTokens: 4000,
    });
    return NextResponse.json({ feedback: feedback.slice(0, 8000) }, { headers: noStore });
  } catch (e) {
    const message = e instanceof DeepSeekError ? e.message : "Feedback isn't available right now.";
    const reason = e instanceof DeepSeekError ? e.reason : "unknown";
    return NextResponse.json({ error: message, reason }, { status: 502, headers: noStore });
  }
}
