import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReport, parseRisk } from "../lib/report-format";

const sample = `A. Sentence flags
- P1 S1 "Urban streets deserve greater attention..." | Risk: High | Signals 1, 4: stock collocation | Ask: Who is this really about?
- P1 S3 "Some projects make money while..." | Risk: Uncertain | Only one signal
B. Paragraph overview
- P1: 5 high/medium sentences, in a row (S1-S5) | Risk: High | No natural sentence
C. Overall
- Overall risk: High, because P1 is High.
D. Grammar (location and type only)
- P2 S3: subject-verb agreement ("Residents has").
Summary: Rewrite P1 yourself.`;

test("sections and items are told apart", () => {
  const blocks = parseReport(sample);
  const sections = blocks.filter((b) => b.kind === "section").map((b) => b.kind === "section" && b.title);
  assert.deepEqual(sections, ["Sentence flags", "Paragraph overview", "Overall", "Grammar (location and type only)", "Summary"]);
  assert.equal(blocks.filter((b) => b.kind === "item").length, 5);
});

test("piped items get location, risk, question and notes", () => {
  const first = parseReport(sample)[1];
  assert.equal(first.kind, "item");
  if (first.kind !== "item") return;
  assert.equal(first.location, 'P1 S1 "Urban streets deserve greater attention..."');
  assert.equal(first.risk, "high");
  assert.equal(first.question, "Who is this really about?");
  assert.deepEqual(first.notes, ["Signals 1, 4: stock collocation"]);
});

test("uncertain risk is recognised", () => {
  const item = parseReport(sample)[2];
  assert.equal(item.kind === "item" && item.risk, "uncertain");
});

test("the overall line carries its risk", () => {
  const overall = parseReport(sample).find((b) => b.kind === "item" && b.text.startsWith("Overall risk"));
  assert.equal(overall?.kind === "item" && overall.risk, "high");
});

test("summary text is kept on the section", () => {
  const last = parseReport(sample).at(-1)!;
  assert.deepEqual(last, { kind: "section", title: "Summary", text: "Rewrite P1 yourself." });
});

test("plain items without pipes stay plain, and continuation lines join", () => {
  const blocks = parseReport("- first point\n  carries on here\n- second point");
  assert.deepEqual(blocks, [
    { kind: "item", text: "first point carries on here" },
    { kind: "item", text: "second point" },
  ]);
});

test("a prompt with no structure still shows every line", () => {
  const blocks = parseReport("Line one.\nLine two.");
  assert.deepEqual(blocks, [{ kind: "item", text: "Line one. Line two." }]);
});

test("markdown bold and headings are stripped", () => {
  const blocks = parseReport("## A. Stock phrases\n- **P1 S1** | Risk: Medium");
  assert.equal(blocks[0].kind === "section" && blocks[0].title, "Stock phrases");
  assert.equal(blocks[1].kind === "item" && blocks[1].risk, "medium");
});

test("parseRisk reads English and Chinese", () => {
  assert.equal(parseRisk("High"), "high");
  assert.equal(parseRisk("中"), "medium");
  assert.equal(parseRisk("Low"), "low");
  assert.equal(parseRisk("不確定"), "uncertain");
  assert.equal(parseRisk("n/a"), undefined);
});
