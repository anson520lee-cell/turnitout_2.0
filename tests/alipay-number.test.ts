import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeAlipayNumber } from "../lib/payments/alipay-number";

const now = new Date("2026-10-26T04:00:00Z"); // 12:00 in Hong Kong

test("a 31-digit number dated today or in the last days looks real", () => {
  assert.equal(looksLikeAlipayNumber("2026102622001400000000000000123", now), true);
  assert.equal(looksLikeAlipayNumber("2026102522001400000000000000123", now), true);
  assert.equal(looksLikeAlipayNumber("2026 1026 2200 1400 0000 0000 0000 123", now), true);
});

test("Hong Kong date is used, not UTC", () => {
  // 2026-10-26 17:00 UTC is already 27 Oct in Hong Kong.
  assert.equal(looksLikeAlipayNumber("2026102722001400000000000000123", new Date("2026-10-26T17:00:00Z")), true);
  assert.equal(looksLikeAlipayNumber("2026102722001400000000000000123", new Date("2026-10-26T15:00:00Z")), false);
});

test("short, lettered, future, old or impossible dates do not", () => {
  assert.equal(looksLikeAlipayNumber("123456", now), false);
  assert.equal(looksLikeAlipayNumber("AMY0001TX", now), false);
  assert.equal(looksLikeAlipayNumber("2026102822001400000000000000123", now), false); // in two days
  assert.equal(looksLikeAlipayNumber("2026101022001400000000000000123", now), false); // weeks ago
  assert.equal(looksLikeAlipayNumber("2026023122001400000000000000123", now), false); // 31 Feb
  assert.equal(looksLikeAlipayNumber("1111111111111111111111111111111", now), false);
});
