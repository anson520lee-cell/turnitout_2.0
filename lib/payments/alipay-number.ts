/**
 * True when an Alipay transaction number has the shape real ones have: a long run
 * of digits (31 on AlipayHK receipts) that starts with the payment date, here
 * required to be within the last few days (Hong Kong time). A number that doesn't
 * look like this is not refused, since a customer may have a receipt we haven't
 * seen; its order just waits for the admin to check it instead of starting at once.
 */
export function looksLikeAlipayNumber(reference: string, now = new Date()): boolean {
  const digits = reference.replace(/[\s-]/g, "");
  if (!/^\d{20,40}$/.test(digits)) return false;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  const paid = Date.UTC(y, m - 1, d);
  const day = new Date(paid);
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return false;
  // Hong Kong is always UTC+8: today's date there, as a UTC midnight.
  const hk = new Date(now.getTime() + 8 * 3600_000);
  const today = Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth(), hk.getUTCDate());
  const ageDays = (today - paid) / 86_400_000;
  return ageDays >= 0 && ageDays <= 3;
}
