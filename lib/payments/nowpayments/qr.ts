import "server-only";
import QRCode from "qrcode";

/**
 * QR code made here, from our own stored address (nothing is sent to a QR
 * website). Bitcoin uses the standard bitcoin: payment URI; tokens use the
 * bare address, which every wallet scanner accepts.
 */
export function paymentUri(coinId: string, address: string, amount: number | null): string {
  if (coinId === "btc" && amount) return `bitcoin:${address}?amount=${amount.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}`;
  return address;
}

export async function qrDataUrl(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, { margin: 1, width: 376, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
}
