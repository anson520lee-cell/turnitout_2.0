import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import { DeepSeekError, DeepSeekRunError, deepseekEnabled, deepseekRun, redeemFeedbackTicket } from "@/lib/deepseek";
import { logModelCall, reportLimitReached } from "@/lib/model-usage";
import { getModelSetting, getScanReportPrompt } from "@/lib/site-settings";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";
import { scanInput } from "@/lib/validation/schemas";

/**
 * Written feedback under a free scan. The scan action hands the browser a
 * signed ticket for that exact text; this route redeems it and asks DeepSeek.
 * The text is not stored or logged (the usage log keeps token counts only), and
 * the provider's errors never reach the browser.
 */

export const maxDuration = 120;

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
  if (await reportLimitReached()) {
    return NextResponse.json({ error: "Written reports are paused for today. The rest of your scan is complete.", reason: "daily_limit" }, { status: 503, headers: noStore });
  }
  const [prompt, setting] = await Promise.all([getScanReportPrompt(), getModelSetting()]);
  try {
    const result = await deepseekRun({
      // The owner's prompt (editable on /admin/prompt), plus one fixed rule they can't remove.
      system: `${prompt}\n\n${DRAFT_GUARD}`,
      user: `<draft>\n${text.data}\n</draft>`,
      // Room for reasoning plus the full report.
      maxTokens: 12_000,
      model: setting.model,
      effort: setting.effort,
    });
    after(() => logModelCall("scan_report", { ok: true, result }));
    return NextResponse.json({ feedback: result.text.slice(0, 16_000) }, { headers: noStore });
  } catch (e) {
    if (e instanceof DeepSeekRunError) after(() => logModelCall("scan_report", { ok: false, error: e }));
    const message = e instanceof DeepSeekError ? e.message : "Feedback isn't available right now.";
    const reason = e instanceof DeepSeekError ? e.reason : "unknown";
    return NextResponse.json({ error: message, reason }, { status: 502, headers: noStore });
  }
}
