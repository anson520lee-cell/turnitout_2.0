import { test } from "node:test";
import assert from "node:assert/strict";
import { changedSentences, recheckInput, similarity, splitSentences } from "../lib/recheck";

const before = `Urban streets deserve greater attention. Streets carry traffic, but they are also public spaces where people meet.

Mobility still matters, but mainly because it shapes access to jobs. In turn, residents rely more on motorized transport.`;

test("sentences are split by paragraph and numbered from 1", () => {
  const s = splitSentences(before);
  assert.deepEqual(s.map((x) => `P${x.p}S${x.s}`), ["P1S1", "P1S2", "P2S1", "P2S2"]);
  assert.equal(s[1].text, "Streets carry traffic, but they are also public spaces where people meet.");
});

test("an unchanged draft has no changed sentences", () => {
  assert.deepEqual(changedSentences(before, before), []);
});

test("only the edited sentence is reported, with its old version", () => {
  const after = before.replace("In turn, residents rely more on motorized transport.", "People end up in cars because the bus is slow.");
  const changed = changedSentences(before, after);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].p, 2);
  assert.equal(changed[0].s, 2);
  assert.equal(changed[0].text, "People end up in cars because the bus is slow.");
});

test("a sentence with only a few words swapped keeps a high overlap and its 'was'", () => {
  const after = before.replace("Urban streets deserve greater attention.", "Urban streets deserve more attention.");
  const [c] = changedSentences(before, after);
  assert.equal(c.was, "Urban streets deserve greater attention.");
  assert.ok(c.similarity >= 0.5, `similarity ${c.similarity}`);
});

test("a fully new sentence has no 'was'", () => {
  const after = `${before}\n\nI walk to the MTR every morning, and the crowd at Tsuen Wan always surprises me.`;
  const [c] = changedSentences(before, after);
  assert.equal(c.was, null);
  assert.equal(c.p, 3);
});

test("a moved sentence counts as unchanged, and case or punctuation changes don't", () => {
  const moved = "Streets carry traffic, but they are also public spaces where people meet. Urban streets deserve greater attention!";
  const changed = changedSentences("Urban streets deserve greater attention. Streets carry traffic, but they are also public spaces where people meet.", moved);
  assert.deepEqual(changed, []);
});

test("similarity is 1 for the same words and 0 for none", () => {
  assert.equal(similarity("a b c", "c b a"), 1);
  assert.equal(similarity("a b c", "x y z"), 0);
  assert.equal(similarity("", "x"), 0);
});

test("recheckInput lists the changed sentences and embeds both drafts", () => {
  const after = before.replace("Urban streets deserve greater attention.", "Urban streets deserve more attention.");
  const { message, changed } = recheckInput(before, after);
  assert.equal(changed.length, 1);
  assert.match(message, /<previous_draft>[\s\S]*Urban streets deserve greater attention[\s\S]*<\/previous_draft>/);
  assert.match(message, /<draft>[\s\S]*more attention[\s\S]*<\/draft>/);
  assert.match(message, /P1 S1 \| now: "Urban streets deserve more attention\." \| was: "Urban streets deserve greater attention\./);
});

test("an identical draft says so", () => {
  assert.match(recheckInput(before, before).message, /identical to the previous one/);
});

test("headings and divider lines are not sentences", () => {
  const text = `# The Physicality of Virtual Intelligence: A Long Title That Has More Than Fourteen Words In It For Sure

## Abstract

The first idea is plain. The second one follows it.

---

## 1.

Introduction: Demystifying the Cloud

### 2.1 Direct-to-Chip Cooling

Water carries heat far better than air does. Racks now need liquid.`;
  const s = splitSentences(text);
  assert.deepEqual(s.map((x) => `P${x.p}S${x.s}`), ["P1S1", "P1S2", "P2S1", "P2S2"]);
  assert.equal(s[0].text, "The first idea is plain.");
});

test("a heading line directly above its text is dropped, the text stays", () => {
  const s = splitSentences("## Method\nWe asked ten people. They agreed.");
  assert.deepEqual(s.map((x) => x.text), ["We asked ten people.", "They agreed."]);
});

test("a short unpunctuated line is kept when it is the only text, and Chinese lines are never dropped as headings", () => {
  assert.equal(splitSentences("Abstract").length, 1);
  assert.equal(splitSentences("---").length, 1);
  assert.equal(splitSentences("香港的街道設計很重要\n\n另一段中文").length, 2);
});

test("short paragraphs with closing punctuation stay", () => {
  assert.equal(splitSentences("Yes.\n\nIt works. Really!").length, 3);
});

test("splitSentences cuts where the lookbehind version did", async () => {
  const { splitSentences } = await import("../lib/recheck");
  const old = (text: string) => text.trim().split(/(?<=[.!?])\s+(?=[A-Z(“"'])/).map((x) => x.trim()).filter(Boolean);
  const samples = [
    "One. Two!  Three? (Four) “Five” 'Six' seven. Eight",
    "It cost 3.5 dollars. e.g. this stays. Dr. Smith agrees!?  Yes. Another one",
    "No stop here and a lowercase. start stays together.",
    "Ends with a stop. ",
  ];
  for (const s of samples) assert.deepEqual(splitSentences(s).map((x) => x.text), old(s), s);
});
