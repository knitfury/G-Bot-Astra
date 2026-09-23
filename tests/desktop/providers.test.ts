import test from "node:test";
import assert from "node:assert/strict";
import { HTTPInference } from "../../desktop/adapters/providers";
import type { ProviderInput } from "../../src/types/domain";
const input: ProviderInput = {
  name: "Test",
  type: "OpenAI-compatible",
  baseUrl: "https://provider.example/v1",
  key: "fake-key",
  model: "test",
  headers: "{}",
  method: "POST",
  auth: "Bearer",
  body: '{"prompt":"{{input}}","model":"{{model}}"}',
  inputPath: "prompt",
  responsePath: "answer",
  tools: true,
};
const run = (
  adapter: HTTPInference,
  p = input,
  signal = new AbortController().signal,
) =>
  adapter.generate(p, [{ role: "user", text: "hello" }], [], signal, () => {});
test("OpenAI streams text and assembles fragmented tool arguments", async () => {
  let auth = "";
  const adapter = new HTTPInference(async (_url, init) => {
    auth = (init?.headers as Record<string, string>).Authorization;
    return new Response(
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"lookup","arguments":"{\\"id\\":"}}]}}]}\n\ndata: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}\n\ndata: [DONE]\n\n',
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const result = await run(adapter);
  assert.equal(result.text, "Hello");
  assert.deepEqual(result.calls[0].arguments, { id: 1 });
  assert.equal(auth, "Bearer fake-key");
});
for (const [type, data] of [
  [
    "Anthropic-compatible",
    {
      content: [
        { type: "text", text: "hello" },
        { type: "tool_use", id: "call", name: "lookup", input: { id: 1 } },
      ],
    },
  ],
  [
    "Gemini-compatible",
    {
      candidates: [
        {
          content: {
            parts: [
              { text: "hello" },
              { functionCall: { name: "lookup", args: { id: 1 } } },
            ],
          },
        },
      ],
    },
  ],
] as const)
  test(`${type} maps native tool requests`, async () => {
    const result = await run(
      new HTTPInference(async () => Response.json(data)),
      { ...input, type },
    );
    assert.equal(result.text, "hello");
    assert.deepEqual(result.calls[0].arguments, { id: 1 });
  });
test("generic REST safely maps quoted input and response text", async () => {
  let body = "";
  const adapter = new HTTPInference(async (_url, init) => {
    body = String(init?.body);
    return Response.json({ answer: "mapped" });
  });
  assert.equal(
    (await run(adapter, { ...input, type: "Generic REST", tools: false })).text,
    "mapped",
  );
  assert.match(body, /hello/);
  await assert.rejects(
    () => run(adapter, { ...input, type: "Generic REST", method: "GET" }),
    /POST/,
  );
});
for (const [status, code] of [
  [401, "PROVIDER_AUTH"],
  [429, "RATE_LIMIT"],
  [500, "NETWORK"],
])
  test(`provider HTTP ${status} becomes safe ${code} error`, async () => {
    await assert.rejects(
      () =>
        run(
          new HTTPInference(
            async () => new Response("SECRET", { status: Number(status) }),
          ),
        ),
      (e) =>
        e instanceof Error &&
        "code" in e &&
        e.code === code &&
        !e.message.includes("SECRET"),
    );
  });
test("malformed responses and cancellation fail clearly", async () => {
  await assert.rejects(
    () => run(new HTTPInference(async () => new Response("broken"))),
    /malformed JSON/,
  );
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    () =>
      run(
        new HTTPInference(async () => {
          throw new DOMException("aborted", "AbortError");
        }),
        input,
        c.signal,
      ),
    /stopped/,
  );
});
test("Anthropic streams text and JSON tool fragments", async () => {
  const events = [
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Hello" },
    },
    {
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", id: "a1", name: "lookup", input: {} },
    },
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '{"id":1}' },
    },
    { type: "message_stop" },
  ];
  const deltas: string[] = [];
  const result = await new HTTPInference(
    async () =>
      new Response(
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } },
      ),
  ).generate(
    { ...input, type: "Anthropic-compatible" },
    [{ role: "user", text: "hello" }],
    [],
    new AbortController().signal,
    (t) => deltas.push(t),
  );
  assert.equal(deltas.join(""), "Hello");
  assert.deepEqual(result.calls[0].arguments, { id: 1 });
});
test("Gemini streaming preserves function thought signatures and excludes private thoughts", async () => {
  let body = "";
  const events = [
    {
      candidates: [
        {
          content: {
            parts: [
              { text: "private", thought: true },
              { text: "Hello" },
              {
                functionCall: { name: "lookup", args: { id: 1 } },
                thoughtSignature: "opaque",
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
    },
  ];
  const adapter = new HTTPInference(async (_u, init) => {
    body = String(init?.body);
    return new Response(
      events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const result = await run(adapter, { ...input, type: "Gemini-compatible" });
  assert.equal(result.text, "Hello");
  assert.equal(result.calls[0].thoughtSignature, "opaque");
  await adapter.generate(
    { ...input, type: "Gemini-compatible" },
    [{ role: "assistant", text: "", calls: result.calls }],
    [],
    new AbortController().signal,
    () => {},
  );
  assert.match(body, /thoughtSignature/);
});
test("truncated streams and provider timeouts are recoverable domain errors", async () => {
  await assert.rejects(
    () =>
      run(
        new HTTPInference(
          async () =>
            new Response(
              'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
              { headers: { "content-type": "text/event-stream" } },
            ),
        ),
      ),
    /before completion/,
  );
  const adapter = new HTTPInference(
    async (_u, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      }),
    10,
  );
  // Keep the event loop alive while AbortSignal's unref'ed timer expires.
  const keep = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      () => run(adapter),
      (e) => e instanceof Error && "code" in e && e.code === "TIMEOUT",
    );
  } finally {
    clearTimeout(keep);
  }
});
