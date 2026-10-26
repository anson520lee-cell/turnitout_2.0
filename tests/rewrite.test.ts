import { test } from "node:test";
import assert from "node:assert/strict";
import { buildItems, checkRewrite, knownNames, parseRewrites, pickFlagged, reviseText, type ReportRewrite } from "../lib/auto-report/rewrite";
import type { AutoReportResult, ReportSentence } from "../lib/auto-report/stitch";

const orig = "Smith (2019) found that 62% of students may rely on stock phrases (Lee, 2020), which \"plays a key role\" in Hong Kong essays.";

test("a faithful rewrite passes", () => {
  const r = "Smith (2019) found that 62% of students may lean on stock phrases (Lee, 2020), and \"plays a key role\" in Hong Kong essays.";
  assert.equal(checkRewrite(orig, r), null);
});

test("numbers, citations, quotations and names must survive", () => {
  assert.match(checkRewrite(orig, orig.replace("62%", "60%")) ?? "", /number/);
  assert.match(checkRewrite(orig, orig.replace("(Lee, 2020)", "(Lee, 2021)")) ?? "", /number|citation/);
  assert.match(checkRewrite(orig, orig.replace("plays a key role", "matters")) ?? "", /citation or quotation/);
  assert.match(checkRewrite(orig, orig.replace("Hong Kong", "Macau")) ?? "", /name or term/);
});

test("hedges stay, claims are not strengthened, no causal link is added", () => {
  const o = "The data suggests that reading habits shape vocabulary.";
  assert.match(checkRewrite(o, "The data shows that reading habits shape vocabulary.") ?? "", /hedge|stronger/);
  assert.match(checkRewrite(o, "The data suggests that reading habits therefore shape vocabulary.") ?? "", /causal/);
  assert.equal(checkRewrite(o, "The data hints that reading habits help shape vocabulary."), "a hedge was removed");
  assert.equal(checkRewrite(o, "The data suggests that vocabulary is shaped by reading habits."), null);
});

test("one sentence, similar length, a real change, same negations", () => {
  const o = "Many students do not read widely before they write their first essay.";
  assert.equal(checkRewrite(o, o), "unchanged");
  assert.equal(checkRewrite(o, "Many students do not read widely. They write first."), "not one sentence");
  assert.equal(checkRewrite(o, "Few read."), "length changed too much");
  assert.equal(checkRewrite(o, "Many students read widely before they write their first essay, mostly."), "the meaning may have flipped");
});

test("a sentence opener is not treated as a name, but a real name is", () => {
  assert.equal(checkRewrite("However, the results were mixed across the three schools.", "The results were mixed across the three schools, though."), null);
  const known = new Set(["Blackmore"]);
  const o = "Blackmore argues that ideas spread by imitation among people.";
  assert.match(checkRewrite(o, "It is argued that ideas spread by imitation among people.", known) ?? "", /Blackmore/);
  assert.equal(checkRewrite("Urban transport has long been shaped by the pursuit of speed.", "City transport has long been shaped by the push for speed.", known), null);
  assert.deepEqual([...knownNames(result([[{ ...sentence(1, "low"), text: "Early on, Blackmore (1999) wrote about London." }]]))].sort(), ["Blackmore", "London"]);
});

test("parseRewrites reads fenced and plain JSON and skips junk", () => {
  const a = parseRewrites('```json\n[{"id": 3, "rewrite": "Hello there."}, {"id": "5", "rewrite": " Yes. "}, {"id": 7}, 4]\n```');
  assert.deepEqual([...a], [[3, "Hello there."], [5, "Yes."]]);
  assert.equal(parseRewrites("no json here").size, 0);
  assert.equal(parseRewrites("[not json]").size, 0);
});

const sentence = (n: number, risk: ReportSentence["risk"], counts = false): ReportSentence => ({ n, text: `Sentence number ${n} is written here with some words.`, risk, why: "Signals 8: predictable", ...(counts ? { counts: true as const } : {}) });
const result = (paras: ReportSentence[][]): AutoReportResult => ({
  version: 1,
  pieces: { total: 1, reviewed: 1 },
  summary: { words: 0, sentences: 0, paragraphs: 0, high: 0, medium: 0, uncertain: 0, flaggedShare: 0, riskyParagraphs: 0, overall: "low" },
  paragraphs: paras.map((sentences, i) => ({ p: i + 1, risk: "low", sentences })),
  grammar: [],
});

test("pickFlagged takes High first, then counted Medium, and caps the number", () => {
  const r = result([[sentence(1, "medium"), sentence(2, "high"), sentence(3, "medium", true), sentence(4, "low")]]);
  assert.deepEqual(pickFlagged(r).map((s) => s.n), [1, 2, 3]);
  assert.deepEqual(pickFlagged(r, 2).map((s) => s.n), [2, 3]);
});

test("buildItems keeps the original where a suggestion is missing or refused", () => {
  const s = [sentence(1, "high"), sentence(2, "high"), sentence(3, "high")];
  const items = buildItems(s, new Map([[1, "Sentence number 1 is put down here using a few words."], [2, "Sentence number 22 is here."]]));
  assert.equal(items[0].rewrite, "Sentence number 1 is put down here using a few words.");
  assert.equal(items[1].rewrite, null);
  assert.ok(items[1].kept);
  assert.equal(items[2].kept, "no suggestion came back");
});

test("reviseText swaps accepted sentences inside the pasted text, or falls back to the report's paragraphs", () => {
  const s1 = sentence(1, "high");
  const s2 = sentence(2, "high");
  const r = result([[s1], [s2]]);
  const rw: ReportRewrite = { version: 1, model: "m", createdAt: "", items: [{ n: 2, original: s2.text, rewrite: "NEW TWO." }, { n: 1, original: s1.text, rewrite: "NEW ONE." }] };
  const source = `# Title\n\n${s1.text}\n\n${s2.text}\n`;
  assert.equal(reviseText(source, r, rw, { 2: "accept" }), `# Title\n\n${s1.text}\n\nNEW TWO.\n`);
  assert.equal(reviseText(source, r, rw, { 1: "accept", 2: "accept" }), "# Title\n\nNEW ONE.\n\nNEW TWO.\n");
  assert.equal(reviseText(null, r, rw, { 1: "accept" }), `NEW ONE.\n\n${s2.text}`);
  assert.equal(reviseText("something else", r, rw, { 1: "accept" }), `NEW ONE.\n\n${s2.text}`);
  assert.equal(reviseText(source, r, rw, {}), source);
});
