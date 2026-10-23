import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { classifierReport } from "@/lib/auto-report/classifier-report";
import { classifierPrimary, detectSentences } from "@/lib/detector";
import { splitSentences } from "@/lib/recheck";
import { DeepSeekError, DeepSeekRunError, deepseekEnabled, deepseekStream, redeemFeedbackTicket } from "@/lib/deepseek";
import { logModelCall, reportLimitReached } from "@/lib/model-usage";
import { getModelSetting, getScanReportPrompt } from "@/lib/site-settings";
import { DRAFT_GUARD, SCAN_RECHECK_ADDENDUM } from "@/lib/local-model/prompts";
import { recheckInput } from "@/lib/recheck";
import { stripReasons } from "@/lib/report-format";
import { scanInput } from "@/lib/validation/schemas";

/**
 * Written feedback under a free scan. The scan action hands the browser a
 * signed ticket for that exact text; this route redeems it and asks DeepSeek.
 * The text is not stored or logged (the usage log keeps token counts only), and
 * the provider's errors never reach the browser. The free scan only says where
 * the problems are: the reasons are taken out here, line by line, before anything
 * is sent.
 */

export const maxDuration = 120;

const body = z.object({ text: z.string().max(20_000), ticket: z.string().max(200), previous: z.string().max(20_000).optional() });
const noStore = { "cache-control": "no-store" };

export async function POST(request: NextRequest) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  const text = parsed.success ? scanInput.safeParse(parsed.data.text) : null;
  if (!parsed.success || !text?.success) return NextResponse.json({ error: "Bad request." }, { status: 400, headers: noStore });
  if (!redeemFeedbackTicket(parsed.data.ticket, text.data)) {
    return NextResponse.json({ error: "This feedback request has expired." }, { status: 403, headers: noStore });
  }
  // With DETECTOR_MODE=primary a fresh scan is marked by the classifier alone: no DeepSeek call, the same line format.
  if (classifierPrimary() && !parsed.data.previous?.trim()) {
    const scores = await detectSentences(splitSentences(text.data).map((s) => s.text));
    if (scores) {
      const body = JSON.stringify({ t: "d", v: `${classifierReport(text.data, scores)}\n` }) + "\n" + JSON.stringify({ t: "done", cut: false }) + "\n";
      return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
    }
  }
  if (!deepseekEnabled()) return NextResponse.json({ error: "Feedback isn't available right now." }, { status: 503, headers: noStore });
  if (await reportLimitReached()) {
    return NextResponse.json({ error: "Written reports are paused for today. The rest of your scan is complete.", reason: "daily_limit" }, { status: 503, headers: noStore });
  }
  const [prompt, setting] = await Promise.all([getScanReportPrompt(), getModelSetting()]);
  // A re-check: the student revised an earlier draft. Only the changed sentences are reviewed.
  const previous = parsed.data.previous?.trim();
  const recheck = previous ? recheckInput(previous, text.data) : null;
  if (recheck && recheck.changed.length === 0) {
    return NextResponse.json({ error: "Nothing changed since the last draft.", reason: "unchanged" }, { status: 400, headers: noStore });
  }
  const input = {
    // The owner's prompt (editable on /admin/prompt), plus fixed rules they can't remove.
    system: [prompt, ...(recheck ? [SCAN_RECHECK_ADDENDUM] : []), DRAFT_GUARD].join("\n\n"),
    user: recheck ? recheck.message : ["<draft>", text.data, "</draft>"].join("\n"),
    // Room for reasoning plus the full report (reasoning counts against this).
    maxTokens: 24_000,
    model: setting.model,
    effort: setting.effort,
  };

  // The report is sent as it is written: one JSON object per line.
  //   {"t":"d","v":"…"}            a piece of the report text
  //   {"t":"done","cut":false}     finished ("cut": it hit the output limit and ends mid-way)
  //   {"t":"err","reason":"…"}     failed (generic reason code only)
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let pending = "";
      const sendLine = (line: string) => {
        const kept = stripReasons(line);
        if (kept) send({ t: "d", v: `${kept}\n` });
      };
      try {
        for await (const event of deepseekStream(input)) {
          if (event.type === "delta") {
            pending += event.text;
            let nl: number;
            while ((nl = pending.indexOf("\n")) >= 0) {
              sendLine(pending.slice(0, nl));
              pending = pending.slice(nl + 1);
            }
          } else {
            sendLine(pending);
            pending = "";
            await logModelCall(recheck ? "scan_recheck" : "scan_report", { ok: true, result: event.result });
            send({ t: "done", cut: event.result.truncated });
          }
        }
      } catch (e) {
        if (e instanceof DeepSeekRunError) await logModelCall(recheck ? "scan_recheck" : "scan_report", { ok: false, error: e });
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
