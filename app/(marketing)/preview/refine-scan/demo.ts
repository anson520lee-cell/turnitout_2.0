import { COUNTED_CURVE, overallFor, type AutoReportResult } from "@/lib/auto-report/stitch";
import { buildItems, knownNames, pickFlagged, type ReportRewrite } from "@/lib/auto-report/rewrite";
import { demoResult } from "../report-scan/demo";

/**
 * Made-up suggestions for the live-rewrite design preview, over the report scan preview's made-up essay. Here
 * every flagged sentence counts toward the score, so the drop is easy to see. No customer text and no real model
 * call: it only lets the view be looked at without paying for a report.
 */

const SUGGESTIONS: Record<number, string> = {
  1: "For a long time, the push for speed has shaped how cities move people around.",
  2: "Many people see faster journeys as good for the economy, and for most of the last century city planners judged success by the minutes they saved.",
  3: "But a fast trip on its own does not mean people can get to what they need.",
  7: "So being able to reach things is a better test of a city than how fast you move.",
  10: "They can put homes, shops and workplaces close enough to walk between, which cuts trips short before any road is built.",
  13: "Neighbourhoods where things are close by give you more than convenience.",
  14: "Shorter trips mean less pollution, cleaner air and more walking, and all of that is good for people's health.",
  15: "Local shops and services also help neighbours get to know each other.",
  16: "Put together, these points show why planners today should put accessibility near the top of their list.",
  21: "Measuring accessibility properly turns out to be a hard problem for researchers.",
  22: "Researchers must allow for different people's needs, how they like to travel, and the way land use and transport networks affect each other.",
  // Refused by the checks on purpose (it adds a causal link), so the preview also shows a sentence kept as written.
  23: "Even so, newer data and mapping tools have therefore made this kind of measurement far easier.",
  24: "Consequently, policymakers now have the tools they need to put accessibility first when they make decisions.",
  29: "To sum up, what matters about a city is not how quickly people can move through it but how easily they can live in it.",
};

export function refineDemoResult(): AutoReportResult {
  const base = demoResult();
  const paragraphs = base.paragraphs.map((p) => ({ ...p, sentences: p.sentences.map((s) => (s.risk === "high" || s.risk === "medium" ? { ...s, counts: true as const } : s)) }));
  const counted = paragraphs.reduce((n, p) => n + p.sentences.filter((s) => s.counts).length, 0);
  const countedShare = counted / base.summary.sentences;
  return { ...base, paragraphs, summary: { ...base.summary, counted, countedShare, overall: overallFor(countedShare, COUNTED_CURVE) } };
}

export function refineDemoRewrite(result: AutoReportResult): ReportRewrite {
  const flagged = pickFlagged(result);
  const answers = new Map(Object.entries(SUGGESTIONS).map(([n, t]) => [Number(n), t]));
  return { version: 1, model: "preview", createdAt: "2026-10-27T00:00:00.000Z", credits: 0, items: buildItems(flagged, answers, knownNames(result)) };
}
