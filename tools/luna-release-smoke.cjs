const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { getScanReportPrompt, getModelSetting } = require("../lib/site-settings.ts");
const { prepareReview, reviewSystem } = require("../lib/auto-report/review.ts");
const { requestReviewPiece, finishProductionReview, REVIEW_CONTEXT_CHARS } = require("../lib/auto-report/review-model.ts");
const { PIECE_SIZE, reportScore, stitchReport } = require("../lib/auto-report/stitch.ts");
const { CITATION_RULE, REWRITE_PROMPT, pickFlagged, rewriteInput, parseRewrites, buildItems, knownNames } = require("../lib/auto-report/rewrite.ts");
const { DRAFT_GUARD } = require("../lib/local-model/prompts.ts");
const { streamWritingModel, writingModelEnabled } = require("../lib/writing-model.ts");

const draft = [
  "It is important to note that the findings highlight the significant role of community engagement in fostering sustainable urban development.",
  "By leveraging comprehensive strategies, stakeholders can facilitate a more resilient and inclusive environment for all residents.",
  "On Tuesday, I counted eleven people using the benches near the library before the rain started.",
  "Most sat close to the door because the canopy kept that row dry. Only one person used the exposed bench across the road.",
  "A second visit on Thursday showed a similar pattern, although the market was open that afternoon and there were more people on the street.",
].join(" ");

async function review(text, system, setting) {
  const input = prepareReview(text, PIECE_SIZE, REVIEW_CONTEXT_CHARS);
  const pieces = await Promise.all(input.pieces.map(async (piece, idx) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { read, result } = await requestReviewPiece(piece, system, setting, 30_000);
      if (read) return [idx, read, result];
    }
    throw new Error("review_validation_failed");
  }));
  const result = finishProductionReview(input, new Map(pieces.map(([idx, read]) => [idx, read])));
  assert.ok(result && Number.isFinite(reportScore(result.summary)), "report_stitch_failed");
  assert.ok(pieces.every(([, , response]) => response.model === "gpt-6-luna"), "unexpected_review_model");
  return { result, attempts: pieces.length };
}

async function rewriteWithLuna(text, setting) {
  const fixture = stitchReport(text, [{ idx: 0, ok: true, truncated: false, report: [
    "A. Sentence flags",
    "- P1 S1 | Risk: High | Signals 7, 8: repeated templates and predictable phrasing",
    "- P1 S2 | Risk: High | Signals 7, 8: closely repeated phrasing",
    "C. Overall",
    "- Overall risk: High.",
  ].join("\n") }]);
  const targets = pickFlagged(fixture, 2);
  assert.equal(targets.length, 2, "rewrite_fixture_failed");
  for (let attempt = 0; attempt < 3; attempt++) {
    let streamed = false;
    try {
      for await (const event of streamWritingModel({ system: [REWRITE_PROMPT, CITATION_RULE, DRAFT_GUARD].join("\n\n"),
        user: rewriteInput(targets, fixture), maxTokens: 2_500, model: setting.model, effort: "low" })) {
        if (event.type === "delta") { streamed = true; continue; }
        const suggestions = buildItems(targets, parseRewrites(event.result.text), knownNames(fixture)).filter(item => item.rewrite);
        console.log("LUNA_RELEASE refinement", JSON.stringify({ attempt: attempt + 1, streamed, suggestions: suggestions.length, model: event.result.model }));
        if (streamed && !event.result.truncated && suggestions.length) {
          return suggestions.reduce((body, item) => body.replace(item.original, item.rewrite), text);
        }
      }
    } catch (error) {
      console.log("LUNA_RELEASE refinement_error", error?.reason || "unexpected");
    }
  }
  throw new Error("refinement_validation_failed");
}

async function main() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "release/luna-model") return;
  assert.ok(writingModelEnabled(), "openai_key_missing");
  const [prompt, setting] = await Promise.all([getScanReportPrompt(), getModelSetting()]);
  assert.equal(createHash("md5").update(prompt).digest("hex"), "f1d0cd747b6f01a75441f4e738a58622", "unexpected_prompt_version");
  assert.equal(setting.model, "gpt-6-luna");
  assert.equal(setting.effort, "low");
  const system = reviewSystem(prompt, true);
  const [report, revisedText] = await Promise.all([review(draft, system, setting), rewriteWithLuna(draft, setting)]);
  assert.notEqual(revisedText, draft, "rewrite_did_not_change_draft");
  const recheck = await review(revisedText, system, setting);
  console.log("LUNA_RELEASE PASS", JSON.stringify({ model: setting.model, effort: setting.effort, prompt: 2,
    report: report.attempts, recheck: recheck.attempts }));
}

main().catch(error => {
  console.error("LUNA_RELEASE FAIL", error.reason || error.message);
  process.exitCode = 1;
});
