import { createHash, timingSafeEqual } from "node:crypto";
import { chunkText } from "@/lib/chunking";
import { WORD_1 } from "@/lib/chunk-prompts";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";
import { PIECE_SIZE, reportOverall, reportScore, stitchReport } from "@/lib/auto-report/stitch";
import { runWritingModel } from "@/lib/writing-model";
import { deepseekRun } from "@/lib/case-comparison-deepseek";
import { estimateCostUsd } from "@/lib/model-usage";

export const maxDuration = 120;
const expiry = 1795554834301;
const tokenHash = Buffer.from("99798865e8b0ca4889ee8a813e8b545ce6c2cb68f78a53a6646603a17f232142", "hex");
const allowed = new Set(["721f40cdf0a1d053097fee8d400647d5da3908caef195c7a21cfbc458aeec4f4","deae6e166743cc7f7abab57c4281fbb7f7d215be870c27f1462fd54141496684","fe784b48f548824fd76c1c911b7bab543e1f2d6f08d61806c32b8ce86a8ba69c","afcd0dff4439d069b73c8455d4383f3bb57ff1064b99dbbdf5ec10f063332280","cab5e8b1fd6214cbf3299d5e09588523fdde085a4814ac96301dc1edd87c0b4e","d13c78dc230087b9031500a27c281b5e4853ac28666d4c9cb4a9523503c71475"]);
const hash = (text: string) => createHash("sha256").update(text).digest();
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "feature/openai-api-trial"
      || Date.now() > expiry || !timingSafeEqual(hash(request.headers.get("authorization") ?? ""), tokenHash)) {
    return json({ error: "not_found" }, 404);
  }
  const input = await request.json().catch(() => null) as { text?: unknown; provider?: unknown } | null;
  if (!input || typeof input.text !== "string" || input.text.length > 6_200
      || !allowed.has(hash(input.text).toString("hex"))
      || (input.provider !== "openai" && input.provider !== "deepseek")) {
    return json({ error: "invalid_input" }, 400);
  }

  const provider = input.provider;
  const pieces = chunkText(input.text, PIECE_SIZE);
  const start = Date.now();
  const system = [WORD_1, DRAFT_GUARD].join("\n\n");
  const run = provider === "openai" ? runWritingModel : deepseekRun;
  const model = provider === "openai" ? "gpt-6-luna" : "deepseek-flash";
  const results = await Promise.all(pieces.map(async (piece, idx) => {
    try {
      const result = await run({
        model, effort: "low", system, user: `<draft>\n${piece.text}\n</draft>`,
        maxTokens: 24_000, timeoutMs: 80_000,
      });
      return { idx, ok: !result.truncated && /^\s*(?:\*\*)?A[.)]\s+/m.test(result.text), result };
    } catch (error) {
      const reason = (error as { reason?: string }).reason;
      return { idx, ok: false, reason: typeof reason === "string" && /^\w+$/.test(reason) ? reason : "unexpected" };
    }
  }));
  const valid = results.every((result) => result.ok && result.result);
  const report = valid
    ? stitchReport(input.text, results.map((r) => ({ idx: r.idx, ok: true, truncated: false, report: r.result!.text })), PIECE_SIZE)
    : null;
  const when = new Date(start);
  const hour = when.getUTCHours();
  const peak = when.getUTCDay() > 0 && when.getUTCDay() < 6 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
  const cost = results.reduce((total, piece) => piece.result ? total + estimateCostUsd(model, piece.result.usage) : total, 0);
  return json({
    model, ms: Date.now() - start,
    score: report ? Math.round(100 * reportScore(report.summary)) : null,
    rawFlaggedShare: report?.summary.flaggedShare,
    band: report ? reportOverall(report.summary) : null,
    usd: provider === "deepseek" && !peak ? cost / 2 : cost,
    pieces: results.map((piece) => ({ ok: piece.ok, effort: piece.result?.effort, usage: piece.result?.usage, reason: piece.reason })),
  });
}
