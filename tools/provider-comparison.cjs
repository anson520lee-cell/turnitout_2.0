const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { WORD_1 } = require("../lib/chunk-prompts.ts");
const { DRAFT_GUARD } = require("../lib/local-model/prompts.ts");
const { STARTER_SAMPLES } = require("../lib/starter-samples.ts");
const { splitSentences } = require("../lib/recheck.ts");
const { chunkText } = require("../lib/chunking.ts");
const { PIECE_SIZE, reportOverall, reportScore, stitchReport } = require("../lib/auto-report/stitch.ts");
const { runWritingModel, writingModelEnabled } = require("../lib/writing-model.ts");

const humanIndices = [0, 2, 4, 6, 7, 9, 11, 12];
const lengths = [1540, 2400, 3000, 3335, 3520, 3865, 3910, 3975];
const system = [WORD_1, DRAFT_GUARD].join("\n\n");

function excerpt(text, limit) {
  let previous;
  let result = "";
  for (const sentence of splitSentences(text)) {
    const separator = previous === undefined ? "" : sentence.p === previous ? " " : "\n\n";
    if (result.length + separator.length + sentence.text.length > limit) break;
    result += separator + sentence.text;
    previous = sentence.p;
  }
  return result;
}

const makeSamples = (group, type) => group.map((sample, index) => {
  const text = excerpt(sample.body, lengths[index]);
  if (text.length < 500 || sample.origin !== type) throw new Error("Invalid benchmark sample");
  return { id: `${type}-${index + 1}`, name: sample.name, origin: type, text, chunks: chunkText(text, PIECE_SIZE) };
});
const samples = [
  ...makeSamples(humanIndices.map((index) => STARTER_SAMPLES[index]), "human"),
  ...makeSamples(STARTER_SAMPLES.filter((sample) => sample.origin === "ai"), "ai"),
];

function deepSeekPeak(at) {
  const time = new Date(at);
  const day = time.getUTCDay();
  const hour = time.getUTCHours();
  return day > 0 && day < 6 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
}

function estimate(provider, usage, at) {
  if (!usage) return 0;
  const fresh = Math.max(0, usage.promptTokens - usage.cacheHitTokens);
  if (provider === "openai") return (fresh * 0.10 + usage.cacheHitTokens * 0.01 + usage.completionTokens * 0.50) / 1e6;
  const peakCost = (fresh * 0.30 + usage.cacheHitTokens * 0.006 + usage.completionTokens * 1.20) / 1e6;
  return deepSeekPeak(at) ? peakCost : peakCost / 2;
}

async function runSample(config, sample) {
  const begin = Date.now();
  const [provider, effort] = config.split(":");
  const model = provider === "openai" ? "gpt-6-luna" : "deepseek-flash";
  const pieces = await Promise.all(sample.chunks.map(async (chunk, idx) => {
    const at = Date.now();
    try {
      const result = await runWritingModel({
        system,
        user: `<draft>\n${chunk.text}\n</draft>`,
        maxTokens: 24_000,
        model,
        effort,
        timeoutMs: 80_000,
      });
      return { idx, result, cost: estimate(provider, result.usage, at), formatted: /^\s*(?:\*\*)?A[.)]\s+/m.test(result.text) };
    } catch (error) {
      return { idx, reason: /^[a-z_0-9]+$/.test(error?.reason ?? "") ? error.reason : "unexpected", cost: estimate(provider, error.usage, at) };
    }
  }));
  const complete = pieces.every((piece) => piece.result && !piece.result.truncated && piece.formatted);
  const stitched = complete ? stitchReport(sample.text, pieces.map((piece) => ({ idx: piece.idx, ok: true, truncated: false, report: piece.result.text })), PIECE_SIZE) : null;
  console.log("MODEL_COMPARE_ROW", JSON.stringify({
    config, id: sample.id, origin: sample.origin, chars: sample.text.length,
    score: stitched ? Math.round(100 * reportScore(stitched.summary)) : null,
    band: stitched ? reportOverall(stitched.summary) : null,
    ms: Date.now() - begin,
    usd: pieces.reduce((sum, piece) => sum + piece.cost, 0),
    pieces: pieces.map((piece) => ({
      effort: piece.result?.effort, truncated: piece.result?.truncated, formatted: piece.formatted,
      usage: piece.result?.usage, error: piece.reason,
    })),
  }));
}

async function runCondition(config) {
  if (!writingModelEnabled()) throw new Error("Provider API key missing");
  const rows = samples.slice();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (rows.length) {
      await runSample(config, rows.shift());
    }
  }));
}

async function main() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "feature/openai-api-trial") return;
  const config = process.argv[2];
  if (config) {
    await runCondition(config);
    return;
  }
  console.log("MODEL_COMPARE_PLAN", JSON.stringify({
    promptSha256: createHash("sha256").update(system).digest("hex"),
    samples: samples.map(({ id, name, text, chunks }) => ({ id, name, chars: text.length, pieces: chunks.length })),
  }));
  await Promise.all(["deepseek:low", "openai:low", "openai:medium"].map((condition) => new Promise((resolve, reject) => {
    const [provider] = condition.split(":");
    const child = spawn(process.execPath, [...process.execArgv, __filename, condition], {
      env: { ...process.env, WRITING_MODEL_PROVIDER: provider }, stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Benchmark worker failed: ${condition}`)));
  })));
  console.log("MODEL_COMPARE_DONE");
}

main().catch((error) => {
  console.error("MODEL_COMPARE_ERROR", error.message);
  process.exitCode = 1;
});
