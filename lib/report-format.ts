/**
 * Turns the model's plain-text self-check report into blocks the scan page
 * can lay out. Works with any prompt the owner writes on /admin/prompt:
 * structure is picked up when present and ignored when it isn't.
 *
 * - "A. Sentence flags" (a letter, then a title) or "Summary:" → a section.
 * - "- ", "* ", "• " or "1. " → an item; other lines continue the item above.
 * - An item split by " | " has fields: "Risk: High" becomes the item's risk,
 *   "Ask: …" its question, and the first field (if it isn't labelled) its
 *   location, e.g. P1 S5 "Some projects…".
 */

export type Risk = "high" | "medium" | "low" | "uncertain";

export type ReportBlock =
  | { kind: "section"; title: string; text?: string }
  | { kind: "item"; text: string; location?: string; risk?: Risk; question?: string; notes?: string[] };

const SECTION = /^([A-H])[.)]\s+(.+)$/;
const SUMMARY = /^(summary|總結)\s*[:：]\s*(.*)$/i;
const BULLET = /^(?:[-*•]|\d+[.)])\s+/;

export function parseRisk(value: string): Risk | undefined {
  const v = value.toLowerCase();
  if (/\bhigh\b|高/.test(v)) return "high";
  if (/\bmedium\b|\bmoderate\b|中/.test(v)) return "medium";
  if (/\blow\b|低/.test(v)) return "low";
  if (/uncertain|unsure|不確定/.test(v)) return "uncertain";
  return undefined;
}

function toItem(raw: string): ReportBlock {
  const text = raw.trim();
  const fields = text.split(/\s+\|\s+/).map((f) => f.trim()).filter(Boolean);
  if (fields.length < 2) {
    // "Overall risk: High, because …" carries a risk too.
    const overall = /^overall risk\s*[:：]\s*(.+)$/i.exec(text);
    const risk = overall ? parseRisk(overall[1].split(/[,.;(]/)[0]) : undefined;
    return risk ? { kind: "item", text, risk } : { kind: "item", text };
  }
  const item: Extract<ReportBlock, { kind: "item" }> = { kind: "item", text, notes: [] };
  fields.forEach((field, i) => {
    const labelled = /^([A-Za-z][A-Za-z ]{0,20})\s*:\s*(.*)$/.exec(field);
    const label = labelled?.[1].toLowerCase().trim();
    if (label === "risk") item.risk = parseRisk(labelled![2]) ?? item.risk;
    else if (label === "ask" || label === "question" || label === "questions") item.question = labelled![2];
    else if (i === 0 && !labelled) item.location = field;
    else item.notes!.push(field);
  });
  return item;
}

export function parseReport(raw: string): ReportBlock[] {
  const lines = raw
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const blocks: ReportBlock[] = [];
  let pending: string | null = null;
  const flush = () => {
    if (pending !== null) blocks.push(toItem(pending));
    pending = null;
  };

  for (const line of lines) {
    const summary = SUMMARY.exec(line);
    const section = SECTION.exec(line);
    if (summary) {
      flush();
      blocks.push({ kind: "section", title: "Summary", text: summary[2] || undefined });
    } else if (section && !BULLET.test(line)) {
      flush();
      blocks.push({ kind: "section", title: section[2].replace(/[:：]\s*$/, "") });
    } else if (BULLET.test(line)) {
      flush();
      pending = line.replace(BULLET, "");
    } else if (pending !== null) {
      pending += ` ${line}`;
    } else {
      // A loose line: text under the last section, or an item of its own.
      const last = blocks[blocks.length - 1];
      if (last?.kind === "section" && last.title === "Summary") last.text = last.text ? `${last.text} ${line}` : line;
      else pending = line;
    }
  }
  flush();
  return blocks;
}

/** The reviewer's overall verdict ("Overall risk: High, because …"), if the report has one. */
export function overallRisk(blocks: ReportBlock[]): Risk | undefined {
  for (const b of blocks) {
    if (b.kind === "item" && b.risk && /^overall risk/i.test(b.text)) return b.risk;
  }
  return undefined;
}

export type DialLevel = "low" | "moderate" | "elevated";
const DIAL_RANK: Record<DialLevel, number> = { low: 0, moderate: 1, elevated: 2 };
/** The detailed review's word for each dial level; "uncertain" says nothing either way. */
export const verdictLevel: Partial<Record<Risk, DialLevel>> = { high: "elevated", medium: "moderate", low: "low" };
/** The higher of two readings, so a scan never shows Low in one place and High in another. */
export function higherLevel(a: DialLevel, b: DialLevel | undefined): DialLevel {
  return b && DIAL_RANK[b] > DIAL_RANK[a] ? b : a;
}

/**
 * One line of a report with its reasons taken out, for the free scan: where the problem is and how risky it
 * looks, nothing about why. Keeps section headings, an item's location and risk (the grammar line, which only
 * names a place and a type, as is); drops reasons, questions, summary text and wrapped continuation lines.
 * Returns null when nothing is left of the line.
 */
export function stripReasons(line: string): string | null {
  const text = line.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();
  if (!text) return null;
  if (SUMMARY.test(text)) return null;
  if (SECTION.test(text) && !BULLET.test(text)) return text;
  if (!BULLET.test(text)) return null;
  const marker = /^(?:[-*•]|\d+[.)])\s+/.exec(text)![0];
  const body = text.slice(marker.length);
  const fields = body.split(/\s+\|\s+/).map((f) => f.trim()).filter(Boolean);
  if (fields.length < 2) {
    const overall = /^(overall risk\s*[:：]\s*[^,.;(]+)/i.exec(body);
    return `${marker}${overall ? overall[1].trim() : body}`;
  }
  const kept = fields.filter((field, i) => {
    const label = /^([A-Za-z][A-Za-z ]{0,20})\s*:\s*/.exec(field)?.[1].toLowerCase().trim();
    return label === "risk" || (i === 0 && !label);
  });
  return kept.length ? `${marker}${kept.join(" | ")}` : null;
}
