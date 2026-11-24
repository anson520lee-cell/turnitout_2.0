import { freeReport, maxPasteChars } from "../../config/app";

/** Count whitespace runs once, just like billableChars, while retaining the original layout. */
export function freeExcerpt(source: string): string {
  const text = source.trim();
  let remaining: number = freeReport.maxChars;
  let end = 0;
  for (const run of text.matchAll(/\s+|\S+/gu)) {
    const chunk = run[0];
    const width = /\s/u.test(chunk[0]) ? 1 : chunk.length;
    if (width > remaining) {
      end += remaining;
      // The billing unit is UTF-16. Never send half of a supplementary character.
      if (/[\uD800-\uDBFF]/u.test(text.charAt(end - 1))) end--;
      break;
    }
    end += chunk.length;
    remaining -= width;
    if (remaining === 0) break;
  }
  const excerpt = text.slice(0, end).trimEnd();
  return excerpt.length > maxPasteChars ? excerpt.replace(/\s+/gu, " ") : excerpt;
}
