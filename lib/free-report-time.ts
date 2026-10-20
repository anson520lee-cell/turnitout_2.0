/** The next Hong Kong midnight after `now` (HK has no daylight saving: UTC+8), as epoch milliseconds. */
export function nextHkMidnight(now: number = Date.now()): number {
  const DAY = 86_400_000;
  const OFFSET = 8 * 3_600_000;
  return Math.floor((now + OFFSET) / DAY) * DAY + DAY - OFFSET;
}
