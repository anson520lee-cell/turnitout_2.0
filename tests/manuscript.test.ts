import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleReport } from "../lib/auto-report/sample";
import { nearness, sentenceAt, typeset } from "../components/visuals/manuscript-surface";
import { createField } from "../components/visuals/manuscript-motion";

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
  // Every sentence knows its own rows, so a lifted sentence can fan its rows apart.
  sentences.forEach((_, i) => {
    const rows = paper.lines.filter((l) => l.sentence === i).map((l) => l.row);
    assert.deepEqual(rows, rows.map((_, k) => k));
    assert.equal(paper.rows[i], rows.length);
  });
});

test("all sentences remain selectable on a bent sheet and on a small screen", () => {
  const rest = createField(sentences.length);
  const bent = { ...rest, x: 0.7, y: 0.3, tailX: 0.55, tailY: 0.45, bend: 1 };
  for (const [w, h] of [
    [280, 175],
    [540, 254],
  ]) {
    for (const field of [rest, bent]) {
      const found = new Set<number>();
      for (let x = 0; x < w; x += 3) {
        for (let y = 0; y < h; y += 3) found.add(sentenceAt(paper, w, h, x / w, y / h, field));
      }
      assert.ok(found.delete(-1), "an area outside the text has no sentence");
      assert.equal(found.size, sentences.length);
    }
  }
});

test("nearness is highest for the sentence under the pointer and fades with distance", () => {
  const [w, h] = [540, 254];
  const field = { ...createField(sentences.length), bend: 0.55 };
  const out = new Float32Array(sentences.length);
  for (let s = 0; s < sentences.length; s++) {
    const line = paper.lines.find((l) => l.sentence === s)!;
    // Aim at the middle of the sentence's first row on the flat sheet.
    let best = { x: 0, y: 0, d: Infinity };
    for (let x = 0; x < w; x += 2) {
      for (let y = 0; y < h; y += 2) {
        if (sentenceAt(paper, w, h, x / w, y / h, { ...field, x: x / w, y: y / h }) !== s) continue;
        const d = Math.abs(x / w - (0.135 + 0.745 * (line.u + line.end) / 2));
        if (d < best.d) best = { x: x / w, y: y / h, d };
      }
    }
    nearness(paper, w, h, { ...field, x: best.x, y: best.y }, out);
    assert.ok(out[s] > 0.6, `sentence ${s + 1} is near its own pointer (${out[s].toFixed(2)})`);
    assert.ok(Math.min(...out) < 0.05, "far sentences are not near");
  }
});

test("the pointer stays on the sentence it is reading until another is clearly closer", () => {
  const [w, h] = [540, 254];
  const field = { ...createField(sentences.length), x: 0.4, y: 0.45, bend: 0.55 };
  // Walk straight down through the rows and count how often the reading changes.
  const changes = (keep: boolean) => {
    let current = -1,
      count = 0;
    for (let y = 0.3; y < 0.7; y += 0.002) {
      const next = sentenceAt(paper, w, h, 0.4, y, field, keep ? current : -1);
      if (next !== current) count++;
      current = next;
    }
    // Walk back up.
    for (let y = 0.7; y > 0.3; y -= 0.002) {
      const next = sentenceAt(paper, w, h, 0.4, y, field, keep ? current : -1);
      if (next !== current) count++;
      current = next;
    }
    return count;
  };
  assert.ok(changes(true) <= changes(false), "keeping the current sentence never adds changes");
  // Jittering a pixel either side of a boundary does not flip the sentence.
  let current = sentenceAt(paper, w, h, 0.4, 0.45, field);
  const start = current;
  for (let i = 0; i < 20; i++) {
    current = sentenceAt(paper, w, h, 0.4, 0.45 + (i % 2 ? 1 : -1) / h, field, current);
    assert.equal(current, start);
  }
});
