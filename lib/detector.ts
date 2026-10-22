import "server-only";

/**
 * The separate AI-text classifier service (tools/detector-service). It is off unless DETECTOR_URL is set and
 * DETECTOR_ENABLED is "true", so deploying this code changes nothing by itself. The text goes to Jordan's own
 * service only, never to a third party, and neither the text nor the raw error is logged.
 */

const TIMEOUT_MS = 20_000;

export function detectorEnabled(): boolean {
  return process.env.DETECTOR_ENABLED === "true" && Boolean(process.env.DETECTOR_URL?.trim());
}

/** Probability (0 to 1) that `text` is AI-written, or null when the service is off, slow or answers badly. */
export async function detectAi(text: string): Promise<number | null> {
  if (!detectorEnabled() || !text.trim()) return null;
  try {
    const res = await fetch(`${process.env.DETECTOR_URL!.trim().replace(/\/+$/, "")}/score`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.DETECTOR_TOKEN ?? ""}` },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { score?: unknown };
    const p = body.score;
    return typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1 ? p : null;
  } catch {
    return null;
  }
}
