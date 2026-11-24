const { runWritingModel, streamWritingModel, writingModelEnabled, writingModelProvider } = require("../lib/writing-model.ts");
const { WORD_1 } = require("../lib/chunk-prompts.ts");
const { DRAFT_GUARD } = require("../lib/local-model/prompts.ts");
const { stitchReport } = require("../lib/auto-report/stitch.ts");
const { CITATION_RULE, REWRITE_PROMPT, checkRewrite, parseRewrites, pickFlagged, rewriteInput } = require("../lib/auto-report/rewrite.ts");
const { estimateCostUsd } = require("../lib/model-usage.ts");

const sample = [
  "It is important to note that these findings highlight the significant role of community engagement in fostering sustainable urban development.",
  "By leveraging comprehensive strategies, stakeholders can facilitate a more resilient and inclusive environment for all residents.",
  "On Tuesday, I counted eleven people using the benches near the library before the rain started.",
].join(" ");

function reportResult(reply) {
  return stitchReport(sample, [{ idx: 0, ok: true, truncated: reply.truncated, report: reply.text }]);
}

function metrics(reply) {
  return {
    model: reply.model,
    effort: reply.effort,
    ms: reply.ms,
    inputTokens: reply.usage.promptTokens,
    outputTokens: reply.usage.completionTokens,
    estimatedUsd: Number(estimateCostUsd(reply.model, reply.usage).toFixed(6)),
  };
}

async function main() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "feature/openai-api-trial") return;
  if (writingModelProvider() !== "openai" || !writingModelEnabled()) {
    console.log("OPENAI_TRIAL setup unavailable");
    return;
  }

  const reply = await runWritingModel({
    system: [WORD_1, DRAFT_GUARD].join("\n\n"),
    user: `<draft>\n${sample}\n</draft>`,
    maxTokens: 2_500,
    timeoutMs: 25_000,
  });
  const report = reportResult(reply);
  const sentences = report.paragraphs.flatMap((paragraph) => paragraph.sentences);
  const picks = pickFlagged(report, 2);
  console.log("OPENAI_TRIAL report", JSON.stringify({
    ...metrics(reply),
    parsed: !reply.truncated && /^A\./m.test(reply.text) && sentences.length === 3,
    flagged: picks.length,
  }));

  const targets = picks.length ? picks : sentences.slice(0, 2);
  let deltas = 0;
  for await (const event of streamWritingModel({
    system: [REWRITE_PROMPT, CITATION_RULE, DRAFT_GUARD].join("\n\n"),
    user: rewriteInput(targets, report),
    maxTokens: 1_500,
  })) {
    if (event.type === "delta") {
      deltas++;
      continue;
    }
    const suggestions = parseRewrites(event.result.text);
    const usable = targets.filter((sentence) => {
      const rewrite = suggestions.get(sentence.n);
      return rewrite && !checkRewrite(sentence.text, rewrite);
    }).length;
    console.log("OPENAI_TRIAL refinement", JSON.stringify({
      ...metrics(event.result),
      streamed: deltas > 0,
      parsed: !event.result.truncated && targets.every((sentence) => suggestions.has(sentence.n)),
      parsedIds: [...suggestions.keys()],
      usable,
      targets: targets.length,
    }));
    if (!suggestions.size) {
      console.log("OPENAI_TRIAL synthetic response", JSON.stringify(event.result.text.replace(/\s+/g, " ").slice(0, 400)));
      const plain = await runWritingModel({
        system: "Edit the supplied sentence for clarity while keeping all facts. Return only the revised sentence.",
        user: "The committee arrived at a decision to delay the vote until Friday.",
        maxTokens: 500,
        timeoutMs: 20_000,
      });
      console.log("OPENAI_TRIAL clarity edit", JSON.stringify({ ...metrics(plain), preservedFriday: /Friday/.test(plain.text) }));
    }
  }
}

main().catch((error) => {
  const reason = /^[a-z_0-9]+$/.test(error?.reason ?? "") ? error.reason : "unexpected";
  console.log("OPENAI_TRIAL error", JSON.stringify({ reason }));
});
