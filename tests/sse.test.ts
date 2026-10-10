import { test } from "node:test";
import assert from "node:assert/strict";
import { sseEvents } from "../lib/sse";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const e of sseEvents(stream)) out.push(e);
  return out;
}

test("events are parsed and [DONE] ends the stream", async () => {
  const events = await collect(streamOf('data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\ndata: {"a":3}\n\n'));
  assert.deepEqual(events, [{ a: 1 }, { a: 2 }]);
});

test("an event split across chunks is put back together", async () => {
  const events = await collect(streamOf('data: {"te', 'xt":"hel', 'lo"}\n', '\ndata: [DONE]\n'));
  assert.deepEqual(events, [{ text: "hello" }]);
});

test("a multi-byte character split across chunks survives", async () => {
  const bytes = new TextEncoder().encode('data: {"t":"風險"}\n\n');
  const cut = bytes.indexOf(0xe9) + 1; // inside the first character
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes.slice(0, cut));
      c.enqueue(bytes.slice(cut));
      c.close();
    },
  });
  assert.deepEqual(await collect(stream), [{ t: "風險" }]);
});

test("comments, blank lines and malformed events are skipped", async () => {
  const events = await collect(streamOf(': keep-alive\n\ndata: not json\n\ndata: {"ok":true}\n\n'));
  assert.deepEqual(events, [{ ok: true }]);
});

test("a stream that ends without [DONE] still yields its events", async () => {
  assert.deepEqual(await collect(streamOf('data: {"x":1}\n')), [{ x: 1 }]);
});
