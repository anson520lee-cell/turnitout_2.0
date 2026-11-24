import assert from "node:assert/strict";
import test from "node:test";
import { freeReport, maxPasteChars } from "../config/app";
import { billableChars } from "../config/pricing";
import { freeExcerpt } from "../lib/orders/free-excerpt";

test("free excerpt ends at the billable limit and retains internal paragraph breaks", () => {
  const prefix = "a".repeat(2000) + "\n\n" + "b".repeat(1999);
  assert.equal(freeExcerpt(prefix + "c".repeat(2000)), prefix);
  assert.equal(billableChars(prefix), freeReport.maxChars);
});

test("free excerpt keeps supplementary characters whole at the cutoff", () => {
  const prefix = "a".repeat(3999);
  assert.equal(freeExcerpt(prefix + "😀rest"), prefix);
  assert.equal(freeExcerpt("a".repeat(3998) + "😀rest"), "a".repeat(3998) + "😀");
});

test("unusually long whitespace runs still yield a valid free request", () => {
  const original = "a" + " ".repeat(maxPasteChars) + "b".repeat(5000);
  const excerpt = freeExcerpt(original);
  assert.ok(excerpt.length <= maxPasteChars);
  assert.equal(billableChars(excerpt), freeReport.maxChars);
});
