import "server-only";

/**
 * The separate AI-text classifier service (tools/detector-service). It is off unless DETECTOR_URL is set and
 * DETECTOR_ENABLED is "true", so deploying this code changes nothing by itself. The text goes to Jordan's own
 * service only, never to a third party, and neither the text nor the raw error is logged.
 */

// A cold container can take 30 to 40 s to load the model; warmDetector() starts it when a report begins.
const TIMEOUT_MS = 45_000;

export function detectorEnabled(): boolean {
  return process.env.DETECTOR_ENABLED === "true" && Boolean(process.env.DETECTOR_URL?.trim());
}

/** Classifier-only scoring for free reports and free-scan feedback (DETECTOR_MODE=primary), instead of DeepSeek. */
export function classifierPrimary(): boolean {
  return detectorEnabled() && process.env.DETECTOR_MODE === "primary";
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

/** Wakes a scaled-to-zero service at the start of a report so it is ready when the last piece finishes. Never throws. */
export function warmDetector(): void {
  if (!detectorEnabled()) return;
  fetch(`${process.env.DETECTOR_URL!.trim().replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(60_000), cache: "no-store" }).catch(() => {});
}

/** One score (0 to 1) per sentence, in order, or null when the service is off, slow or answers badly. */
export async function detectSentences(sentences: string[]): Promise<number[] | null> {
  if (!detectorEnabled() || sentences.length === 0) return null;
  try {
    const res = await fetch(`${process.env.DETECTOR_URL!.trim().replace(/\/+$/, "")}/sentences`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.DETECTOR_TOKEN ?? ""}` },
      body: JSON.stringify({ sentences }),
      signal: AbortSignal.timeout(75_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { scores?: unknown };
    const s = body.scores;
    return Array.isArray(s) && s.length === sentences.length && s.every((x) => typeof x === "number" && x >= 0 && x <= 1) ? (s as number[]) : null;
  } catch {
    return null;
  }
}
