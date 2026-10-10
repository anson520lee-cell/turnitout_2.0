import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DeepSeekError, DeepSeekRunError, deepseekEnabled, deepseekStream, redeemFeedbackTicket } from "@/lib/deepseek";
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
  const input = {
    // The owner's prompt (editable on /admin/prompt), plus one fixed rule they can't remove.
    system: [prompt, DRAFT_GUARD].join("\n\n"),
    user: ["<draft>", text.data, "</draft>"].join("\n"),
    // Room for reasoning plus the full report.
    maxTokens: 12_000,
    model: setting.model,
    effort: setting.effort,
  };

  // The report is sent as it is written: one JSON object per line.
  //   {"t":"d","v":"…"}            a piece of the report text
  //   {"t":"done"}                 finished
  //   {"t":"err","reason":"…"}     failed (generic reason code only)
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const event of deepseekStream(input)) {
          if (event.type === "delta") send({ t: "d", v: event.text });
          else {
            await logModelCall("scan_report", { ok: true, result: event.result });
            send({ t: "done" });
          }
        }
      } catch (e) {
        if (e instanceof DeepSeekRunError) await logModelCall("scan_report", { ok: false, error: e });
        send({ t: "err", reason: e instanceof DeepSeekError ? e.reason : "unknown" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
