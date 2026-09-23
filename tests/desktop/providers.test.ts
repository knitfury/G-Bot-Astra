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
