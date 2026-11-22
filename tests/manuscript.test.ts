import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleReport } from "../lib/auto-report/sample";
import { restPose, sentenceAt, typeset } from "../components/visuals/manuscript-surface";

const sentences = sampleReport.paragraphs.flatMap((p) =>
  p.sentences.map((s) => ({ ...s, paragraph: p.p })),
);
const paper = typeset(sentences);

test("the manuscript lays out every sample word in source order within the sheet", () => {
  sentences.forEach((s, i) => {
    assert.equal(
      paper.words
        .filter((w) => w.sentence === i)
        .map((w) => w.text)
        .join(" "),
      s.text,
    );
  });
  for (const line of paper.lines) {
    assert.ok(line.u >= 0 && line.end > line.u && line.end <= 1);
    assert.ok(line.v > 0 && line.v < 1);
  }
});

test("all sentences remain selectable on a bent sheet and on a small screen", () => {
  for (const [w, h] of [
    [280, 175],
    [540, 254],
  ]) {
    for (const pose of [restPose, { ...restPose, x: 0.7, y: 0.3, lift: 1, pulse: 0.4 }]) {
      const found = new Set<number>();
      for (let x = 0; x < w; x += 3) {
        for (let y = 0; y < h; y += 3) found.add(sentenceAt(paper, w, h, x / w, y / h, pose));
      }
      assert.ok(found.delete(-1), "an area outside the text has no sentence");
      assert.equal(found.size, sentences.length);
    }
  }
});
