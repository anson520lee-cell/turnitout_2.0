import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_STALLS, RESUME_WINDOW_MS, acceptAll, buildItems, checkOutcome, checkRewrite, knownNames, mergeRound, needsRound, nextStep, parseRewrites, pickFlagged, probeMarks, resumable, reviseText, roundTargets, streamedRewrites, type ReportRewrite } from "../lib/auto-report/rewrite";
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

test("the meaning may change, but no number, citation or quotation is added", () => {
  const o = "The data suggests that reading habits shape vocabulary.";
  assert.equal(checkRewrite(o, "Reading habits shape vocabulary, I think."), null);
  assert.equal(checkRewrite(o, "Honestly, what you read shapes the words you use."), null);
  assert.match(checkRewrite(o, "Reading habits shape about 40% of vocabulary.") ?? "", /number/);
  assert.match(checkRewrite(o, "Reading habits shape vocabulary (Nation, 2001).") ?? "", /number|citation/);
});

test("up to three sentences, a length in range and a real change", () => {
  const o = "Many students do not read widely before they write their first essay.";
  assert.equal(checkRewrite(o, o), "unchanged");
  assert.equal(checkRewrite(o, "Lots of students don't read much before they write their first essay, so it shows."), null);
  assert.equal(checkRewrite(o, "Students. They do not read much. Not widely. Then essays."), "split into too many sentences");
  assert.equal(checkRewrite(o, "Few read."), "length changed too much");
});

test("a sentence opener is not treated as a name, but a real name is", () => {
  assert.equal(checkRewrite("However, the results were mixed across the three schools.", "The results were mixed across the three schools, though."), null);
  const known = new Set(["Blackmore"]);
  const o = "Blackmore argues that ideas spread by imitation among people.";
  assert.match(checkRewrite(o, "It is argued that ideas spread by imitation among people.", known) ?? "", /Blackmore/);
  assert.equal(checkRewrite("Urban transport has long been shaped by the pursuit of speed.", "City transport has long been shaped by the push for speed.", known), null);
  assert.deepEqual([...knownNames(result([[{ ...sentence(1, "low"), text: "Early on, Blackmore (1999) wrote about London." }]]))].sort(), ["Blackmore", "London"]);
});

test("a later round may reword the openers of a suggestion's second and third sentences, and I'd is not a name", () => {
  // Round 2 of Neo's 100% essay (2026-10-29): 12 of 15 new suggestions were refused for "That", "I'd" and the like.
  const known = new Set(["Building", "Information", "Modelling", "BIM", "AI", "Blackmore"]);
  const r1 = "Facility management keeps putting Building Information Modelling (BIM) together with artificial intelligence (AI). Honestly, I'd call that pairing a real change in how the job gets done.";
  assert.equal(checkRewrite(r1, "Honestly, Building Information Modelling (BIM) and artificial intelligence (AI) keep turning up together in facility management, and to me that changes how the work is done.", known), null);
  const r2 = "For a long time, the sector ran on separate manual workflows. That made information hard to share.";
  assert.equal(checkRewrite(r2, "The sector ran on its own manual workflows for ages, so information got stuck between teams.", known), null);
  // A name inside any of the sentences, or a known name opening one, still has to stay.
  assert.match(checkRewrite(r1, "Facility management keeps putting artificial intelligence (AI) to work in more and more places. To me that pairing really does change how the whole job gets done.", known) ?? "", /Building/);
  assert.match(checkRewrite("The idea is old. Blackmore argues that ideas spread by imitation.", "The idea is old, and ideas spread by imitation.", known) ?? "", /Blackmore/);
});

test("streamedRewrites reads each answer as soon as its object is complete, as parseRewrites would", () => {
  const full = '```json\n[{"id": 3, "rewrite": "A {brace} and a \\"quote\\" } inside."}, {"id": 5, "rewrite": " Yes. "}, {"id": 7, "rewrite": "Last one."}]\n```';
  const cut = full.indexOf('{"id": 7') + 12;
  const partial = streamedRewrites(full.slice(0, cut));
  assert.deepEqual([...partial.keys()], [3, 5], "the half-written third answer is not read yet");
  assert.equal(partial.get(3), 'A {brace} and a "quote" } inside.');
  assert.equal(partial.get(5), "Yes.");
  assert.deepEqual(streamedRewrites(full), parseRewrites(full));
  assert.equal(streamedRewrites("thinking...").size, 0);
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

test("the re-check finds each rewritten sentence in the revised text and says whether it still counts", () => {
  const rw: ReportRewrite = {
    version: 1,
    model: "m",
    createdAt: "",
    items: [
      { n: 1, original: "One.", rewrite: "First rewrite." },
      { n: 2, original: "Two.", rewrite: null, kept: "length changed too much" },
      { n: 3, original: "Three.", rewrite: "Third rewrite." },
    ],
  };
  assert.deepEqual(acceptAll(rw), { 1: "accept", 3: "accept" });
  // Same numbering: found by text.
  const after = result([[{ ...sentence(1, "high", true), text: "First rewrite." }, sentence(2, "high", true), { ...sentence(3, "low"), text: "Third rewrite." }]]);
  assert.deepEqual(checkOutcome(rw, after), { stillCounted: [1], cleared: [3] });
  // A sentence not found by its text falls back to its number.
  const moved = result([[sentence(1, "medium"), sentence(2, "low"), sentence(3, "high", true)]]);
  assert.deepEqual(checkOutcome(rw, moved), { stillCounted: [3], cleared: [1] });
  // A rewrite split in two still counts when either half does.
  const split: ReportRewrite = { ...rw, items: [{ n: 1, original: "One.", rewrite: "First half. Second half." }, rw.items[2]] };
  const halves = result([[{ ...sentence(1, "low"), text: "First half." }, { ...sentence(2, "medium", true), text: "Second half." }, sentence(3, "low"), { ...sentence(4, "low"), text: "Third rewrite." }]]);
  assert.deepEqual(checkOutcome(split, halves), { stillCounted: [1], cleared: [3] });
});

test("the add-on is priced from the report's price, and a free report is priced as the paid report of its length", async () => {
  const { rewritePrice, rewritePricing } = await import("../config/pricing");
  const { rewriteCredits } = await import("../lib/auto-report/rewrite");
  assert.equal(rewritePricing.multiple, 3);
  assert.equal(rewritePrice(500, 5000), 1500); // a 5-credit report: 15 credits
  assert.equal(rewritePrice(0, 4000), 1200); // a free 4,000-character report: as a paid one, 3 x 4 credits
  assert.equal(rewritePrice(0, 100), 600); // never below 3 x the report minimum
  const r = result([[sentence(1, "high")]]);
  assert.equal(rewriteCredits({ price: 300, source_text: null }, r), 9);
});

test("a later round rewrites what the re-check still counts, and keeps everything else", () => {
  const r = result([[{ ...sentence(1, "high", true), text: "One." }, { ...sentence(2, "high", true), text: "Two." }, { n: 3, risk: "low", text: "Three." }]]);
  const rw: ReportRewrite = {
    version: 1,
    model: "m",
    createdAt: "",
    items: [
      { n: 1, original: "One.", rewrite: "First half. Second half.", why: "Signal 8" },
      { n: 2, original: "Two.", rewrite: "Second rewrite." },
    ],
  };
  // Not re-checked yet: no round.
  assert.equal(needsRound(rw), false);
  const after = result([[{ ...sentence(1, "low"), text: "First half." }, { ...sentence(2, "medium", true), text: "Second half.", why: "Signals 1, 8" }, { ...sentence(3, "low"), text: "Second rewrite." }, { ...sentence(4, "high", true), text: "Three.", why: "Signal 4" }]]);
  const checked: ReportRewrite = { ...rw, check: { checkedAt: "", score: 0.8, stillCounted: [1], cleared: [2], result: after } };
  assert.equal(needsRound(checked), true);
  assert.equal(needsRound({ ...checked, round: 3 }), false);
  assert.equal(needsRound({ ...checked, check: { ...checked.check!, score: 0.2 } }), false);
  // The split suggestion (as it reads now) and the student's own sentence that now counts.
  const targets = roundTargets(r, checked);
  assert.deepEqual(targets.map((t) => [t.n, t.text, t.why]), [[1, "First half. Second half.", "Signals 1, 8"], [3, "Three.", "Signal 4"]]);
  const merged = mergeRound(checked.items, [{ n: 1, original: "First half. Second half.", rewrite: "New one." }, { n: 3, original: "Three.", rewrite: "Third." }], r);
  assert.deepEqual(merged, [
    { n: 1, original: "One.", rewrite: "New one.", why: "Signal 8" },
    { n: 2, original: "Two.", rewrite: "Second rewrite." },
    { n: 3, original: "Three.", rewrite: "Third." },
  ]);
});

test("the detector flags short tidy sentences, so a rewrite may not split one off", () => {
  const short = "Many students do not read widely before they write their first essay.";
  // One sentence in, one sentence out: a split into short sentences is refused (signal 3 and 8, 2026-10-29).
  assert.match(checkRewrite(short, "Lots of students don't read much. Then they write their first essay.") ?? "", /more sentences than the original/);
  const long = "Machine learning architectures trained on historical maintenance records, ambient atmospheric data and vibration telemetry are capable of anticipating mechanical wear with exceptional precision, which in turn lets facility managers and their maintenance teams act early instead of reacting late.";
  // A long sentence may become two long ones, but not one long and one short.
  assert.equal(checkRewrite(long, "Feed a model old repair logs, local weather and the vibration readings from the machine and it starts to spot wear before anyone notices. That is how managers get to fix a part early and not after it breaks down."), null);
  assert.match(checkRewrite(long, "Feed a model old repair logs, local weather and the vibration readings from the machine and it starts to spot wear before anyone notices, which gives managers time. That way they fix it early.") ?? "", /short sentence/);
  // Three short sentences from a round 1 suggestion may be merged back into one.
  const three = "Facility managers do not need a fixed calendar. Waiting for a breakdown is worse. They can fix things when the data says so.";
  assert.equal(checkRewrite(three, "Facility managers don't have to follow a fixed calendar and waiting until something breaks is worse, so they just fix things when the data says it needs fixing."), null);
});

test("nextStep says what an unfinished rewrite waits for, so the page and the server runner follow the same path", () => {
  const at = new Date("2026-10-29T05:00:00Z");
  const item = { n: 1, original: "A.", rewrite: "B." };
  const check = (score: number) => ({ checkedAt: at.toISOString(), score, stillCounted: [1], cleared: [], result: {} as never });
  const base: ReportRewrite = { version: 1, model: "m", createdAt: at.toISOString(), items: [item] };
  assert.equal(nextStep({ ...base, items: [{ n: 1, original: "A.", rewrite: null }] }), null, "nothing was suggested");
  assert.deepEqual(nextStep(base), { kind: "check", round: 1 }, "not re-checked yet");
  assert.deepEqual(nextStep({ ...base, check: check(0.98), round: 1 }), { kind: "round", round: 2 }, "still too high: another round");
  assert.deepEqual(nextStep({ ...base, check: check(0.98), round: 2, pending: { round: 2, items: [item] } }), { kind: "check", round: 2 }, "a round written, not re-checked");
  assert.deepEqual(nextStep({ ...base, check: check(0.97), round: 2 }), { kind: "round", round: 3 });
  assert.equal(nextStep({ ...base, check: check(0.97), round: 3 }), null, "rounds used up");
  assert.equal(nextStep({ ...base, check: check(0.12), round: 1 }), null, "under the target");
});

test("only a recent, unfinished rewrite is carried on without being asked", () => {
  const made = Date.parse("2026-10-29T05:00:00Z");
  const rw: ReportRewrite = { version: 1, model: "m", createdAt: new Date(made).toISOString(), items: [{ n: 1, original: "A.", rewrite: "B." }] };
  assert.equal(resumable(rw, made + 60_000), true);
  assert.equal(resumable(rw, made + RESUME_WINDOW_MS + 1), false, "an old one waits for a click");
  assert.equal(resumable({ ...rw, stalls: MAX_STALLS }, made + 60_000), false, "the runner gave up on it");
  assert.equal(resumable({ ...rw, createdAt: "" }, made), false);
});

test("checkRewrite: a later round may not grow past the student's own sentence", () => {
  const student = "Remote work gives people more time because there is no commute.";
  const earlier = "Without a daily commute, people get hours back, and that is the main thing remote work gives them.";
  const longer = "Without a daily commute, people get hours back every week, and that is the main thing remote work gives them, which workers value.";
  assert.equal(checkRewrite(earlier, longer, new Set()), null);
  assert.equal(checkRewrite(earlier, longer, new Set(), student), "length changed too much");
  assert.equal(checkRewrite(earlier, "Hours come back when the commute goes, and that is what working from home gives people.", new Set(), student), null);
});

test("the live rewrite is scored a quarter, half and three quarters of the way, not for tiny jobs", () => {
  assert.deepEqual(probeMarks(46), [12, 23, 35]);
  assert.deepEqual(probeMarks(12), [3, 6, 9]);
  assert.deepEqual(probeMarks(5), []);
  assert.deepEqual(probeMarks(8), [4, 6]);
  assert.deepEqual(probeMarks(0), []);
});
