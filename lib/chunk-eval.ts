/**
 * Scoring a chunk-size experiment. A trial is one piece of a sample text run
 * through the reviewer; its report is scored against the sample's known
 * sentence labels (AI-written or human-written, or Turnitin's flags), and the
 * counts are added up per setting. Pure functions, no I/O.
 */

import { scoreReport, type TruthSentence } from "@/lib/eval";
import { splitSentences } from "@/lib/recheck";

export type Origin = "human" | "ai" | "turnitin" | "mixed";

export interface Sample {
  id: string;
  origin: Origin;
  body: string;
  /** Label of every sentence of `body`, in text order (as numbered by splitSentences). */
  sentences: TruthSentence[];
}

export interface Trial {
  sampleId: string;
  size: number;
  model: string;
  effort: string;
  batch: string;
  first: number;
  chunk: string;
  report: string;
  ok: boolean;
  truncated: boolean;
  ms: number;
  tokens: number;
}

/** Sentence counts, pooled over trials. "Called" means the reviewer rated the sentence High or Medium. */
export interface Tally {
  sentences: number;
  positives: number;
  hit: number;
  falseAlarm: number;
  called: number;
}

export const emptyTally = (): Tally => ({ sentences: 0, positives: 0, hit: 0, falseAlarm: 0, called: 0 });

/** Score one piece's report. Null when the piece can't be scored (failed or cut off). */
export function scoreTrial(t: Trial, sample: Sample): Tally | null {
  if (!t.ok || t.truncated) return null;
  const local = splitSentences(t.chunk);
  const slice = sample.sentences.slice(t.first, t.first + local.length);
  if (slice.length !== local.length) return null;
  const truth: TruthSentence[] = local.map((s, i) => ({ p: s.p, s: s.s, flagged: slice[i].flagged }));
  const c = scoreReport(t.report, truth).highMedium;
  const positives = truth.filter((x) => x.flagged).length;
  return { sentences: truth.length, positives, hit: c.hit, falseAlarm: c.falseAlarm, called: c.called };
}

export function addTally(a: Tally, b: Tally): Tally {
  return {
    sentences: a.sentences + b.sentences,
    positives: a.positives + b.positives,
    hit: a.hit + b.hit,
    falseAlarm: a.falseAlarm + b.falseAlarm,
    called: a.called + b.called,
  };
}

const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null);

export interface Rates {
  /** Share of truly flagged sentences the reviewer called. */
  recall: number | null;
  /** Share of unflagged sentences the reviewer called by mistake. */
  falseAlarmRate: number | null;
  /** Of the sentences called, the share that were truly flagged. */
  precision: number | null;
  /** (recall + (1 - falseAlarmRate)) / 2: 50% is chance, 100% is perfect. */
  balanced: number | null;
}

export function rates(t: Tally): Rates {
  const negatives = t.sentences - t.positives;
  const recall = ratio(t.hit, t.positives);
  const falseAlarmRate = ratio(t.falseAlarm, negatives);
  return {
    recall,
    falseAlarmRate,
    precision: ratio(t.hit, t.called),
    balanced: recall !== null && falseAlarmRate !== null ? (recall + (1 - falseAlarmRate)) / 2 : null,
  };
}

export interface SettingRow {
  model: string;
  effort: string;
  size: number;
  batches: number;
  pieces: number;
  failed: number;
  cut: number;
  all: Tally;
  byOrigin: Partial<Record<Origin, Tally>>;
  secondsPerPiece: number;
  tokensPerPiece: number;
}

/** One row per model, reasoning and piece size, pooled over every repeat. */
export function summarize(trials: Trial[], samples: Map<string, Sample>): SettingRow[] {
  const groups = new Map<string, Trial[]>();
  for (const t of trials) {
    const key = `${t.model}|${t.effort}|${t.size}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const rows: SettingRow[] = [];
  for (const list of groups.values()) {
    let all = emptyTally();
    const byOrigin: Partial<Record<Origin, Tally>> = {};
    let failed = 0;
    let cut = 0;
    let ms = 0;
    let tokens = 0;
    for (const t of list) {
      const sample = samples.get(t.sampleId);
      if (!sample) continue;
      if (!t.ok) failed += 1;
      else if (t.truncated) cut += 1;
      ms += t.ms;
      tokens += t.tokens;
      const s = scoreTrial(t, sample);
      if (!s) continue;
      all = addTally(all, s);
      byOrigin[sample.origin] = addTally(byOrigin[sample.origin] ?? emptyTally(), s);
    }
    rows.push({
      model: list[0].model,
      effort: list[0].effort,
      size: list[0].size,
      batches: new Set(list.map((t) => t.batch)).size,
      pieces: list.length,
      failed,
      cut,
      all,
      byOrigin,
      secondsPerPiece: ms / list.length / 1000,
      tokensPerPiece: tokens / list.length,
    });
  }
  return rows.sort((a, b) => a.model.localeCompare(b.model) || a.effort.localeCompare(b.effort) || a.size - b.size);
}
