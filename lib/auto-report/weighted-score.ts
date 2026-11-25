import { aiScore, COUNTED_CURVE, SCORE_BANDS, type AutoReportResult, type ReportSentence } from "./stitch";

export const WEIGHTED_SCORE_VERSION = "2026-11-25-weighted-evidence-v7";

export type StyleMargins = { strongest: number; second: number };

export function uplift(score: number, start: number, exponent: number): number {
  return score <= start ? score : start + (1 - start) * ((score - start) / (1 - start)) ** exponent;
}

function signalsFor(sentence: ReportSentence) {
  const stored = sentence.why?.match(/^\s*Signals?\s+(\d+(?:,\s*\d+)*):/i)?.[1];
  const signals = sentence.signals ?? stored?.split(",").map(Number) ?? [];
  return new Set(signals.filter(signal => signal >= 1 && signal <= 9));
}

/** Aggregate validated ratings without counting a confirmed sentence twice. */
export function weightedRiskEvidence(report: AutoReportResult) {
  const additional = new Set(report.calibration?.confirmed ?? []);
  const highParagraphs = new Set<number>();
  const structuralParagraphs = new Set<number>();
  const plainParagraphs = new Set<number>();
  const weakHighParagraphs = new Set<number>();
  let strong = 0, structural = 0, high = 0, plain = 0, template = 0, residual = 0, total = 0;
  for (const paragraph of report.paragraphs) {
    for (const sentence of paragraph.sentences) {
      total++;
      if (sentence.risk !== "high" && sentence.risk !== "medium") continue;
      const signals = signalsFor(sentence);
      const hasStructure = signals.has(7);
      const hasPlainMoves = signals.has(9);
      const isHigh = sentence.risk === "high";
      if (isHigh) {
        high++;
        highParagraphs.add(paragraph.p);
      }
      if (hasStructure || hasPlainMoves) {
        structural++;
        structuralParagraphs.add(paragraph.p);
      }
      if (hasPlainMoves) {
        plain++;
        plainParagraphs.add(paragraph.p);
      }
      if (sentence.counts) {
        strong++;
        if (!isHigh && hasStructure && !hasPlainMoves) template++;
      } else if (!additional.has(sentence.n)) {
        const independentSignals = signals.size - Number(signals.has(8));
        const strength = [.25, .50, 1][Math.min(independentSignals, 2)];
        residual += strength * (isHigh ? .65 : .56);
        if (isHigh && independentSignals) weakHighParagraphs.add(paragraph.p);
      }
    }
  }
  if (!total || total !== report.summary.sentences || strong !== report.summary.counted) return null;
  return {
    total, strong: strong / total, structural: structural / total, high: high / total,
    plain: plain / total, template: template / total, residual: residual / total,
    highParagraphs: highParagraphs.size, structuralParagraphs: structuralParagraphs.size,
    plainParagraphs: plainParagraphs.size, weakHighParagraphs: weakHighParagraphs.size,
    confirmed: additional.size > 0,
  };
}

type WeightedEvidence = NonNullable<ReturnType<typeof weightedRiskEvidence>>;
const LOW_CEILING = .2949;
const REVIEW_CEILING = .5949;
const MAX_UNCONFIRMED_INCREASE = .06;

/** Give supporting ratings a fractional vote and require agreement before a new alert. */
export function scoreWeightedRisk(old: number, evidence: WeightedEvidence, margins: StyleMargins): number {
  const { moderate, elevated } = SCORE_BANDS;
  const { total, strong, structural, high, plain, template, residual, confirmed,
    structuralParagraphs, highParagraphs, plainParagraphs, weakHighParagraphs } = evidence;
  const { strongest, second } = margins;
  const nearStyle = strongest >= -.98 && second >= -1.60;
  const supportsPlainStyle = strongest >= -2.20 && second >= -2.55;
  const enough = total >= 12;
  const repeatedStructure = enough && structuralParagraphs >= 2 && structural >= .075;
  const supportedProse = weakHighParagraphs >= 2 && strong >= .22;
  const proseReview = supportedProse && (
    (repeatedStructure && high >= .135 && highParagraphs >= 2 && nearStyle)
    || (enough && strongest >= 0 && second >= -.40 && high >= .36 && highParagraphs >= 3)
  );
  const plainReview = repeatedStructure && strong >= .28 && plain >= .13
    && plainParagraphs >= 3 && supportsPlainStyle;
  const allowReview = enough && (confirmed || proseReview || plainReview);
  const allowElevated = enough && strong >= .28
    && (confirmed || (proseReview && high >= .20) || (plainReview && plain >= .155));

  // A higher bar applies when creating a warning than when retaining an
  // existing one. One matching paragraph can support the existing mixed band.
  const substantialStructure = repeatedStructure && structuralParagraphs >= 3 && structural >= .24
    && high >= .30 && highParagraphs >= 3;
  const recurringSpan = enough && structuralParagraphs >= 5 && structural >= .42;
  const secondBasis = (plainParagraphs >= 3 && plain >= .15 && high >= .18 && highParagraphs >= 3)
    || (plainParagraphs >= 2 && high >= .12 && highParagraphs >= 3 && second >= -2.75)
    || (plainParagraphs >= 3 && strongest >= -.35 && second >= -1.90);
  const repeatedExisting = (substantialStructure && structural >= .42)
    || (repeatedStructure && strong >= .42 && plain >= .18 && plainParagraphs >= 2 && supportsPlainStyle)
    || (recurringSpan && secondBasis);
  const distinct = substantialStructure && (strongest >= -.65 || second >= -1.55);
  const retainElevated = old >= elevated && (nearStyle || confirmed || allowElevated || distinct || repeatedExisting);
  const mixedSection = repeatedStructure && highParagraphs >= 2 && high >= .18 && strongest >= -.80;
  const localPlainReview = repeatedStructure && strong >= .28 && plain >= .15
    && plainParagraphs >= 3 && strongest >= -2.35 && second >= -2.75;
  const localHighReview = enough && strongest >= -.65 && high >= .45 && weakHighParagraphs >= 2;
  const supportsExistingReview = localPlainReview || localHighReview || (strongest >= -1.45 && second >= -1.95)
    || (repeatedStructure && plainParagraphs >= 3 && plain >= .24 && strongest >= -2.30 && second >= -3.40);
  const adjustedElevated = old >= elevated && !retainElevated;
  const retainReview = old >= moderate && (adjustedElevated
    ? mixedSection || localHighReview || localPlainReview
    : confirmed || nearStyle || allowReview || mixedSection || distinct || supportsExistingReview || repeatedExisting);

  const discountTemplate = !allowReview && !retainReview && !retainElevated
    && template >= .08 && template >= .45 * strong && high <= .155;
  const reconsider = old >= moderate && (!retainReview || adjustedElevated);
  let weightedStrong = strong;
  if (discountTemplate) weightedStrong -= template * .40;
  else if (reconsider) {
    const patterned = Math.min(strong, structural);
    weightedStrong = patterned + .35 * (strong - patterned);
  }
  const baseline = adjustedElevated && retainReview ? REVIEW_CEILING
    : discountTemplate || reconsider ? uplift(aiScore(weightedStrong, COUNTED_CURVE), .45, .5) : old;
  const raw = aiScore(weightedStrong + residual, COUNTED_CURVE);
  let target = Math.max(baseline + .22 * residual * (1 - baseline), uplift(raw, .45, .5));
  if (allowElevated) target = Math.max(target, uplift(raw, .20, .28));

  let ceiling = LOW_CEILING;
  if (allowElevated) ceiling = 1;
  else if (retainElevated) ceiling = Math.min(1, old + MAX_UNCONFIRMED_INCREASE);
  else if (allowReview || retainReview) {
    ceiling = allowReview || mixedSection ? REVIEW_CEILING : Math.min(REVIEW_CEILING, old + MAX_UNCONFIRMED_INCREASE);
  } else if (old < moderate || discountTemplate) {
    ceiling = Math.min(old < moderate ? Math.max(old, LOW_CEILING) : LOW_CEILING, baseline + MAX_UNCONFIRMED_INCREASE);
  }
  return Math.min(ceiling, target);
}
