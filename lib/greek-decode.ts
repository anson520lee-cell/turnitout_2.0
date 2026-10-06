/**
 * Random Greek text with a "decoding" cycle, shared by the CSS document and
 * the WebGL hero document. It is a pure function of (line, time): no state,
 * so the same line renders the same on server and client for a given time.
 *
 * Each cycle a line scrambles, a wave sweeps left to right and locks each
 * glyph into its final character, the line holds, then it scrambles again
 * into new text. `settled` is the locked prefix, `noise` the still-decoding
 * tail (drawn in an accent colour).
 */

const GLYPHS = "αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΘΛΞΠΣΦΨΩ";
const CYCLE = 8.5; // seconds per full decode / hold / scramble loop
const SWEEP = 0.34; // fraction of the cycle spent decoding
const HOLD_END = 0.8; // after this the line scrambles back to noise

/** Small integer hash -> [0, 1). */
function h(a: number, b: number, c: number): number {
  let x = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function glyph(a: number, b: number, c: number): string {
  return GLYPHS[Math.floor(h(a, b, c) * GLYPHS.length)];
}

export interface DecodedLine {
  settled: string;
  noise: string;
}

/** `len` characters, `seed` identifies the line, `t` is seconds. */
export function decodeLine(len: number, seed: number, t: number): DecodedLine {
  const local = t + seed * 0.55;
  const epoch = Math.floor(local / CYCLE);
  const p = (local - epoch * CYCLE) / CYCLE;
  const frame = Math.floor(t * 16);

  let locked: number;
  if (p < SWEEP) locked = Math.floor((p / SWEEP) * len);
  else if (p < HOLD_END) locked = len;
  else locked = 0;

  let settled = "";
  let noise = "";
  for (let i = 0; i < len; i++) {
    // word gaps, fixed per (line, epoch, position)
    const gap = i > 0 && i < len - 1 && h(seed, i, epoch + 91) < 0.15;
    if (i < locked) settled += gap ? " " : glyph(seed, i, epoch);
    else noise += gap ? " " : glyph(seed + 7, i, frame);
  }
  return { settled, noise };
}

/** A fully decoded line, for the server render and reduced motion. */
export function staticLine(len: number, seed: number): string {
  return decodeLine(len, seed, (SWEEP + 0.2) * CYCLE - seed * 0.55).settled;
}
