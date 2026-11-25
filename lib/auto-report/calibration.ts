import "server-only";

import model from "./paragraph-model-20261125.json";
import { aiScore, COUNTED_CURVE, reportOverall, reportScore, type AutoReportResult, type ReportParagraph } from "./stitch";

const WORD = /[\p{L}\p{Nl}\p{No}]+(?:'[\p{L}\p{Nl}\p{No}]+)?|\p{Nd}+/gu;
const TOKENS = /[\p{L}\p{Nl}\p{No}]+(?:'[\p{L}\p{Nl}\p{No}]+)?|\p{Nd}+|[.,!?;:()'"–-]/gu;
const functionWords = new Set(model.functionWords);
const models = model.models.map(item => ({ ...item, vocabulary: new Map(item.terms.map((term, i) => [term, i])) }));
const mean = (items: number[]) => items.reduce((sum, value) => sum + value, 0) / items.length;
const deviation = (items: number[], average: number) => Math.sqrt(mean(items.map(value => (value - average) ** 2)));
const normalize = (text: string) => text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replaceAll("—", "–")
  .toLowerCase().replaceAll("ß", "ss").replaceAll("ς", "σ");

function quantile(sorted: number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}

function features(sentences: string[]) {
  const wordsBySentence = sentences.map(sentence => sentence.match(WORD) ?? []);
  const words = wordsBySentence.flat();
  const lengths = wordsBySentence.map(list => list.length);
  const sorted = [...lengths].sort((a, b) => a - b);
  const wordLengths = words.map(word => [...word].length);
  const frequencies = new Map<string, number>();
  for (const word of words) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  const variety: number[] = [];
  for (let i = 0; i + 24 <= words.length; i += 8) variety.push(new Set(words.slice(i, i + 24)).size / 24);
  const differences = lengths.slice(1).map((length, i) => Math.abs(length - lengths[i]));
  const shape = sentences.flatMap(sentence => ["START", ...(sentence.match(TOKENS) ?? []).map(token => {
    if (functionWords.has(token) || !/[\p{L}\p{N}]/u.test(token)) return token;
    if (/^\p{Nd}+$/u.test(token)) return "NUM";
    return /n't$|'(?:ll|re|ve|m|d|s)$/.test(token) ? "CONTRACT" : "WORD";
  })]);
  const ngrams = new Map<string, number>();
  for (let i = 0; i < shape.length; i++) {
    for (let size = 1; size <= 4 && i + size <= shape.length; size++) {
      const term = shape.slice(i, i + size).join(" ");
      ngrams.set(term, (ngrams.get(term) ?? 0) + 1);
    }
  }
  const n = words.length;
  const text = sentences.join(" ");
  const numeric = [
    mean(lengths), deviation(lengths, mean(lengths)), quantile(sorted, .25), quantile(sorted, .75),
    sorted[0], sorted.at(-1)!, differences.length ? mean(differences) : 0,
    lengths.filter(length => length <= 8).length / lengths.length,
    lengths.filter(length => length >= 30).length / lengths.length,
    mean(wordLengths), deviation(wordLengths, mean(wordLengths)), mean(variety),
    [...frequencies.values()].filter(count => count >= 3).length / frequencies.size,
    words.filter(word => functionWords.has(word)).length / n,
    words.filter(word => word.includes("'")).length / n, words.filter(word => /^\p{Nd}+$/u.test(word)).length / n,
    ...[...",:;!?-–()\""].map(char => (text.split(char).length - 1) / n),
  ];
  return { ngrams, numeric };
}

function margin(input: ReturnType<typeof features>, item: typeof models[number]): number {
  let norm = 0;
  let sum = 0;
  for (const [term, count] of input.ngrams) {
    const index = item.vocabulary.get(term);
    if (index === undefined) continue;
    const idf = (1 + Math.log(count)) * item.idf[index];
    norm += idf * idf;
    sum += idf * item.weights[index];
  }
  let prediction = item.intercept + (norm ? sum / Math.sqrt(norm) : 0);
  for (const [i, value] of input.numeric.entries()) {
    const scaled = (value - item.means[i]) / item.scales[i];
    prediction += Math.max(-5, Math.min(5, scaled)) * .22 * item.weights[item.terms.length + i];
  }
  return prediction - item.threshold;
}

function roundEven(value: number): number {
  return value % 1 === .5 ? Math.floor(value / 2) * 2 + (Math.floor(value) % 2 ? 2 : 0) : Math.round(value);
}

function paragraphsAgreed(paragraphs: ReportParagraph[]): Set<number> {
  const strengths: number[] = [];
  const ids = new Set<number>();
  for (const paragraph of paragraphs) {
    const sentences = paragraph.sentences.map(sentence => ({ n: sentence.n, text: normalize(sentence.text) }));
    const counts = sentences.map(sentence => sentence.text.match(WORD)?.length ?? 0);
    const words = counts.reduce((sum, count) => sum + count, 0);
    if (words < 45 || !sentences.length) continue;
    const windows = Math.min(Math.max(1, roundEven(words / 160)), sentences.length);
    const size = Math.floor(sentences.length / windows);
    const remainder = sentences.length % windows;
    let start = 0;
    let strength = 0;
    for (let index = 0; index < windows; index++) {
      const end = start + size + (index < remainder ? 1 : 0);
      if (counts.slice(start, end).reduce((sum, count) => sum + count, 0) >= 45) {
        const group = sentences.slice(start, end);
        const input = features(group.map(sentence => sentence.text));
        const agreement = Math.min(...models.map(item => margin(input, item)));
        if (agreement > 0) {
          strength = Math.max(agreement, strength);
          for (const sentence of group) ids.add(sentence.n);
        }
      }
      start = end;
    }
    if (strength > 0) strengths.push(strength);
  }
  strengths.sort((a, b) => b - a);
  return (strengths[1] ?? 0) > model.confirmation ? ids : new Set();
}

function uplift(score: number, start: number, exponent: number): number {
  return score <= start ? score : start + (1 - start) * ((score - start) / (1 - start)) ** exponent;
}

/** Apply the two calibrated scoring branches to an already validated review. */
export function calibrateReview(report: AutoReportResult): AutoReportResult {
  if (report.calibration || report.summary.counted === undefined) return report;
  const { summary, paragraphs } = report;
  const base = reportScore(summary);
  const scoreOnly = uplift(base, .45, .5);
  const confirmed = paragraphsAgreed(paragraphs);
  const additions = paragraphs.flatMap(p => p.sentences.filter(s => !s.counts && confirmed.has(s.n)).map(s => s.n));
  const joint = confirmed.size ? uplift(aiScore(((summary.counted ?? 0) + additions.length) / summary.sentences, COUNTED_CURVE), .2, .25) : base;
  const calibrated = Math.max(scoreOnly, joint);
  const next = { ...summary, calibrated };
  return { ...report, summary: { ...next, overall: reportOverall(next) },
    calibration: { version: model.version, confirmed: joint > scoreOnly ? additions : [] } };
}
