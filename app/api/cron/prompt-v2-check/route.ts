import { createHash, timingSafeEqual } from "node:crypto";
import { getScanReportPrompt } from "@/lib/site-settings";
import { PIECE_SIZE, reportScore, reportOverall, type PieceRead } from "@/lib/auto-report/stitch";
import { prepareReview, reviewSystem, reviewInput, parseReviewPiece } from "@/lib/auto-report/review";
import { finishProductionReview, requestReviewPiece, REVIEW_CONTEXT_CHARS } from "@/lib/auto-report/review-model";
import { runWritingModel } from "@/lib/prompt-v2-openai";
import type { ChatUsage } from "@/lib/deepseek";

export const maxDuration = 240;
const expiry = 1795622159947;
const tokenHash = Buffer.from("96c73024b3ddafb48d7b699907615fa9757149cf3d9f5120d069f0a0ce5de93c", "hex");
const allowed = new Set(["fe784b48f548824fd76c1c911b7bab543e1f2d6f08d61806c32b8ce86a8ba69c","721f40cdf0a1d053097fee8d400647d5da3908caef195c7a21cfbc458aeec4f4","afcd0dff4439d069b73c8455d4383f3bb57ff1064b99dbbdf5ec10f063332280","cab5e8b1fd6214cbf3299d5e09588523fdde085a4814ac96301dc1edd87c0b4e","deae6e166743cc7f7abab57c4281fbb7f7d215be870c27f1462fd54141496684","d13c78dc230087b9031500a27c281b5e4853ac28666d4c9cb4a9523503c71475"]);
const promptDigest = "f1d0cd747b6f01a75441f4e738a58622";
const hash = (text: string) => createHash("sha256").update(text).digest();
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

function cost(provider: "openai" | "deepseek", usage: ChatUsage, at: number) {
  const cached = Math.min(usage.cacheHitTokens, usage.promptTokens);
  const fresh = usage.promptTokens - cached;
  if (provider === "openai") return (fresh * .10 + cached * .01 + usage.completionTokens * .50) / 1e6;
  const now = new Date(at);
  const h = now.getUTCHours();
  const peak = now.getUTCDay() > 0 && now.getUTCDay() < 6 && ((h >= 1 && h < 4) || (h >= 6 && h < 10));
  const full = (fresh * .30 + cached * .006 + usage.completionTokens * 1.20) / 1e6;
  return peak ? full : full / 2;
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "feature/turnitin-prompt-v2-check"
      || Date.now() > expiry || !timingSafeEqual(hash(request.headers.get("authorization") ?? ""), tokenHash)) {
    return json({ error: "not_found" }, 404);
  }
  const input = await request.json().catch(() => null) as { text?: unknown; provider?: unknown } | null;
  if (!input || typeof input.text !== "string" || input.text.length > 6_200
      || !allowed.has(hash(input.text).toString("hex"))
      || (input.provider !== "openai" && input.provider !== "deepseek")) return json({ error: "invalid_input" }, 400);

  const prompt = await getScanReportPrompt();
  if (createHash("md5").update(prompt).digest("hex") !== promptDigest) return json({ error: "prompt_version_mismatch" }, 409);
  const provider = input.provider;
  const system = reviewSystem(prompt, true);
  const review = prepareReview(input.text, PIECE_SIZE, REVIEW_CONTEXT_CHARS);
  const start = Date.now();
  const reads = new Map<number, PieceRead>();
  const rows = await Promise.all(review.pieces.map(async (piece, idx) => {
    const attempts = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const at = Date.now();
      const timeoutMs = Math.min(80_000, 220_000 - (at - start));
      if (timeoutMs < 5_000) break;
      try {
        const checked = provider === "deepseek"
          ? await requestReviewPiece(piece, system, { model: "deepseek-flash", effort: "low" }, timeoutMs)
          : await (async () => {
              const result = await runWritingModel({ model: "gpt-6-luna", effort: "low",
                system, user: reviewInput(piece), maxTokens: 24_000, timeoutMs });
              return { result, read: result.truncated ? null : parseReviewPiece(piece, result.text) };
            })();
        attempts.push({ valid: Boolean(checked.read), effort: checked.result.effort,
          error: checked.read ? null : checked.result.truncated ? "truncated" : "invalid_review",
          usd: cost(provider, checked.result.usage, at) });
        if (checked.read) {
          reads.set(idx, checked.read);
          break;
        }
      } catch (e) {
        const failure = e as { reason?: string; usage?: ChatUsage };
        const reason = failure.reason && /^\w+$/.test(failure.reason) ? failure.reason : "unexpected";
        attempts.push({ valid: false, error: reason, usd: failure.usage ? cost(provider, failure.usage, at) : 0 });
        if (/^http_(401|402|403|404)$/.test(reason)) break;
      }
    }
    return attempts;
  }));
  const result = finishProductionReview(review, reads);
  return json({
    provider, promptDigest, ms: Date.now() - start,
    score: result ? Math.round(100 * reportScore(result.summary)) : null,
    band: result ? reportOverall(result.summary) : null,
    usd: rows.flat().reduce((total, row) => total + row.usd, 0), pieces: rows,
  });
}
