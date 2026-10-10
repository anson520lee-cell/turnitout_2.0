/** Server-sent events (the stream format DeepSeek uses), parsed without any dependencies. */

/** Parses DeepSeek's server-sent events: yields each JSON payload until [DONE]. */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          yield JSON.parse(data);
        } catch {
          // A malformed event is skipped; the stream carries on.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
