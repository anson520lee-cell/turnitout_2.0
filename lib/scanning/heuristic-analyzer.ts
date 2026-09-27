import type {
  AnalysisResult,
  ParagraphSignal,
  RiskLevel,
  Signal,
  SignalId,
  WritingAnalyzer,
} from "./types";

/**
 * Deterministic, explainable text statistics. It measures regularity in the
 * writing itself; it does not call any detector and does not claim to know
 * who wrote the text. Every number shown to the user comes from the input.
 */

const TRANSITIONS = [
  "moreover", "furthermore", "additionally", "in addition", "however", "therefore",
  "thus", "consequently", "overall", "in conclusion", "notably", "importantly",
  "ultimately", "similarly", "conversely", "nevertheless", "hence", "in summary",
  "to summarize", "firstly", "secondly", "lastly", "finally", "as a result",
  "on the other hand", "in essence", "in particular", "subsequently", "accordingly",
];

const STOCK_PHRASES = [
  "plays a crucial role", "plays a vital role", "plays a pivotal role", "it is important to note",
  "it is worth noting", "in today's", "delve into", "a testament to", "navigate the complexities",
  "multifaceted", "underscores the", "highlights the importance", "in the realm of",
  "a myriad of", "the landscape of", "foster", "paving the way", "shed light on",
  "a deeper understanding", "serves as a", "in conclusion", "not only", "a wide range of",
  "it is essential to", "crucial to", "intricate", "tapestry", "ever-evolving",
];

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

function words(s: string): string[] {
  return (s.toLowerCase().match(WORD_RE) ?? []);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => words(p).length >= 5);
}

function splitSentences(paragraph: string): string[] {
  // Keep common abbreviations and decimals from splitting.
  const protectedText = paragraph
    .replace(/\b(e\.g|i\.e|et al|etc|vs|cf|Dr|Mr|Mrs|Ms|Prof|No|Fig|pp)\./gi, (m) => m.replace(/\./g, "§"))
    .replace(/(\d)\.(\d)/g, "$1§$2");
  return protectedText
    .split(/(?<=[.!?])["”')\]]*\s+(?=["“'(\[]?[A-Z0-9])/)
    .map((s) => s.replace(/§/g, ".").trim())
    .filter((s) => words(s).length >= 3);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
}

function std(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Linear map: `lo` → 0, `hi` → 100 (works for inverted ranges too). */
function scale(value: number, lo: number, hi: number): number {
  return Math.round(clamp01((value - lo) / (hi - lo)) * 100);
}

function levelOf(score: number): RiskLevel {
  if (score >= 60) return "elevated";
  if (score >= 35) return "moderate";
  return "low";
}

function startsWithTransition(sentence: string): string | null {
  const s = sentence.toLowerCase().replace(/^["“'(\[]+/, "");
  for (const t of TRANSITIONS) {
    if (s.startsWith(t + ",") || s.startsWith(t + " ")) return t;
  }
  return null;
}

function stockPhraseHits(text: string): string[] {
  const lower = text.toLowerCase().replace(/’/g, "'");
  return STOCK_PHRASES.filter((p) => lower.includes(p));
}

/** Moving-average type–token ratio over 50-word windows. */
function mattr(ws: string[], window = 50): number {
  if (ws.length < window) return new Set(ws).size / Math.max(ws.length, 1);
  let total = 0;
  let n = 0;
  for (let i = 0; i + window <= ws.length; i += 10) {
    total += new Set(ws.slice(i, i + window)).size / window;
    n++;
  }
  return total / n;
}

function repeatedTrigramRate(ws: string[]): number {
  const counts = new Map<string, number>();
  for (let i = 0; i + 3 <= ws.length; i++) {
    const g = ws.slice(i, i + 3).join(" ");
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let repeated = 0;
  for (const c of counts.values()) if (c > 1) repeated += c;
  return repeated / Math.max(ws.length - 2, 1);
}

const LABELS: Record<SignalId, string> = {
  sentence_variation: "Sentence Variation",
  structural_repetition: "Structural Repetition",
  transition_patterns: "Transition Patterns",
  phrase_uniformity: "Phrase Uniformity",
  lexical_diversity: "Lexical Diversity",
  paragraph_consistency: "Paragraph Consistency",
};

function signal(
  id: SignalId,
  score: number | null,
  measurement: string,
  explanation: string,
): Signal {
  return {
    id,
    label: LABELS[id],
    score,
    level: score === null ? null : levelOf(score),
    measurement,
    explanation,
  };
}

export class HeuristicWritingAnalyzer implements WritingAnalyzer {
  readonly id = "heuristic-v1";

  async analyze(text: string): Promise<AnalysisResult> {
    const paragraphs = splitParagraphs(text);
    const paraSentences = paragraphs.map(splitSentences);
    const sentences = paraSentences.flat();
    const allWords = words(text);
    const sentLens = sentences.map((s) => words(s).length);

    // 1. Sentence variation (coefficient of variation of sentence length).
    const cv = sentLens.length > 3 ? std(sentLens) / mean(sentLens) : null;
    const sv = cv === null ? null : scale(cv, 0.6, 0.25);

    // 2. Structural repetition: how concentrated sentence openings are.
    const openers = sentences.map((s) => words(s).slice(0, 2).join(" "));
    const firstWords = sentences.map((s) => words(s)[0] ?? "");
    const openerCounts = new Map<string, number>();
    firstWords.forEach((w) => openerCounts.set(w, (openerCounts.get(w) ?? 0) + 1));
    const topOpenerShare = sentences.length
      ? Math.max(...openerCounts.values()) / sentences.length
      : 0;
    const repeatedOpeners =
      openers.length - new Set(openers).size;
    const sr =
      sentences.length > 4
        ? Math.round(
            scale(topOpenerShare, 0.15, 0.4) * 0.6 +
              scale(repeatedOpeners / sentences.length, 0.05, 0.3) * 0.4,
          )
        : null;

    // 3. Transition patterns: share of sentences opening with a stock connector.
    const transitionHits = sentences.map(startsWithTransition).filter(Boolean) as string[];
    const transitionRate = sentences.length ? transitionHits.length / sentences.length : 0;
    const tp = sentences.length > 3 ? scale(transitionRate, 0.08, 0.35) : null;
    const distinctTransitions = [...new Set(transitionHits)];

    // 4. Phrase uniformity: stock phrasing + repeated three-word sequences.
    const stock = stockPhraseHits(text);
    const trigram = repeatedTrigramRate(allWords);
    const pu = Math.round(
      scale(stock.length / Math.max(allWords.length / 250, 1), 0.3, 3) * 0.6 +
        scale(trigram, 0.02, 0.12) * 0.4,
    );

    // 5. Lexical diversity.
    const m = mattr(allWords);
    const ld = allWords.length >= 60 ? scale(m, 0.78, 0.62) : null;

    // 6. Paragraph consistency: very even paragraph lengths.
    const paraLens = paragraphs.map((p) => words(p).length);
    const pcv = paraLens.length >= 3 ? std(paraLens) / mean(paraLens) : null;
    const pc = pcv === null ? null : scale(pcv, 0.45, 0.12);

    const signals: Signal[] = [
      signal(
        "sentence_variation",
        sv,
        cv === null
          ? "Too few sentences to measure"
          : `Average ${mean(sentLens).toFixed(0)} words per sentence, varying by about ±${std(sentLens).toFixed(0)}`,
        "Human writing usually mixes short and long sentences. Very even sentence lengths are a pattern automated detectors often weigh.",
      ),
      signal(
        "structural_repetition",
        sr,
        sr === null
          ? "Too few sentences to measure"
          : `${Math.round(topOpenerShare * 100)}% of sentences start with the same word`,
        "Many sentences opening the same way creates a repeated rhythm across the text.",
      ),
      signal(
        "transition_patterns",
        tp,
        tp === null
          ? "Too few sentences to measure"
          : `${transitionHits.length} of ${sentences.length} sentences open with a connector${distinctTransitions.length ? ` (${distinctTransitions.slice(0, 4).join(", ")})` : ""}`,
        "Frequent formal connectors such as “Moreover” or “Furthermore” at the start of sentences are common in formulaic writing.",
      ),
      signal(
        "phrase_uniformity",
        pu,
        stock.length
          ? `${stock.length} common stock phrase${stock.length > 1 ? "s" : ""} found (${stock.slice(0, 3).map((s) => `“${s}”`).join(", ")})`
          : "No common stock phrases found",
        "Widely used set phrases and repeated word sequences make text more predictable.",
      ),
      signal(
        "lexical_diversity",
        ld,
        ld === null
          ? "Text too short to measure"
          : `${Math.round(m * 100)} distinct words per 100, on average`,
        "A narrow, repeated vocabulary is one of the predictability signals detectors use. Technical terms naturally repeat, so read this alongside your subject.",
      ),
      signal(
        "paragraph_consistency",
        pc,
        pc === null
          ? "Needs at least three paragraphs"
          : `Paragraphs average ${mean(paraLens).toFixed(0)} words, varying by about ±${std(paraLens).toFixed(0)}`,
        "Paragraphs of near-identical length and shape can read as templated.",
      ),
    ];

    const weights: Record<SignalId, number> = {
      sentence_variation: 0.25,
      structural_repetition: 0.15,
      transition_patterns: 0.2,
      phrase_uniformity: 0.2,
      lexical_diversity: 0.1,
      paragraph_consistency: 0.1,
    };
    let wsum = 0;
    let total = 0;
    for (const s of signals) {
      if (s.score === null) continue;
      wsum += weights[s.id];
      total += s.score * weights[s.id];
    }
    const overallScore = wsum ? total / wsum : 0;

    const paragraphSignals: ParagraphSignal[] = paragraphs.map((p, index) => {
      const ss = paraSentences[index];
      const lens = ss.map((s) => words(s).length);
      const notes: string[] = [];
      let score = 0;
      if (lens.length >= 3) {
        const pcv2 = std(lens) / mean(lens);
        if (pcv2 < 0.3) {
          notes.push("Sentence lengths are very even");
          score += 40;
        }
      }
      const th = ss.map(startsWithTransition).filter(Boolean);
      if (th.length >= 2 || (ss.length > 0 && th.length / ss.length > 0.4)) {
        notes.push(`${th.length} sentences open with a connector`);
        score += 35;
      }
      const ph = stockPhraseHits(p);
      if (ph.length) {
        notes.push(`Stock phrasing: ${ph.slice(0, 2).map((x) => `“${x}”`).join(", ")}`);
        score += Math.min(40, ph.length * 20);
      }
      const excerpt = p.length > 140 ? `${p.slice(0, 140).trimEnd()}…` : p;
      return { index, excerpt, words: words(p).length, level: levelOf(Math.min(score, 100)), notes };
    });

    const recommendations: string[] = [];
    if ((sv ?? 0) >= 35) recommendations.push("Sentence lengths are quite uniform. Mixing shorter and longer sentences often reads more naturally.");
    if ((tp ?? 0) >= 35) recommendations.push("Several sentences open with formal connectors. Check whether each one is needed for the argument.");
    if (pu >= 35) recommendations.push("Some stock phrases appear. Plainer, more specific wording is usually clearer.");
    if ((sr ?? 0) >= 35) recommendations.push("Many sentences begin the same way. Varying openings improves flow.");
    if (!recommendations.length) recommendations.push("No strong regularity patterns stood out in this text.");

    return {
      overallRisk: levelOf(overallScore),
      signals,
      paragraphs: paragraphSignals,
      recommendations,
      metadata: {
        analyzer: this.id,
        version: "1.0.0",
        words: allWords.length,
        sentences: sentences.length,
        paragraphs: paragraphs.length,
        isMock: false,
      },
    };
  }
}
