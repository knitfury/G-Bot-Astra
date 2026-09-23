import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { RemoteMCP } from "../../desktop/adapters/mcp";
import {
  AtomicStore,
  SecretVault,
  stringMap,
} from "../../desktop/runtime/storage";
import type { MCPConnection } from "../../src/types/domain";
test("real SDK remote transport authenticates, discovers disabled tools, calls and reconnects", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gbot-mcp-"));
  const vault = new SecretVault(
    new AtomicStore(dir, "secrets", () => ({}), stringMap),
    {
      available: async () => true,
      encrypt: async (v) => Buffer.from(v),
      decrypt: async (v) => v.toString(),
    },
  );
  await vault.init();
  let count = 0;
  const http = createServer(async (req, res) => {
    if (req.headers.authorization !== "Bearer fixture-token") {
      res.writeHead(401);
      res.end();
      return;
    }
    const sdk = new McpServer({ name: "fixture", version: "1.0.0" });
    sdk.registerTool(
      "stock",
      {
        description: "Read stock",
        inputSchema: { sku: z.string() },
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      async ({ sku }) => {
        count++;
        return { content: [{ type: "text", text: `${sku}: 24 available` }] };
      },
    );
    sdk.registerTool(
      "change",
      { inputSchema: { id: z.string() } },
      async () => ({ content: [{ type: "text", text: "changed" }] }),
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await sdk.connect(transport);
    res.on("close", () => {
      void transport.close();
      void sdk.close();
    });
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      await transport.handleRequest(
        req,
        res,
        raw ? JSON.parse(raw) : undefined,
      );
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  assert.ok(address && typeof address !== "string");
  const c: MCPConnection = {
    id: "one",
    slot: 0,
    name: "Any vendor",
    url: `http://127.0.0.1:${address.port}/mcp`,
    category: "Inventory",
    icon: "Inventory",
    auth: "Token",
    status: "disconnected",
    enabled: false,
    tools: [],
    lastConnected: "",
    error: "",
    permissionSummary: "",
    maskedCredential: "",
  };
  const runtime = new RemoteMCP(vault, async () => {});
  try {
    await assert.rejects(
      () => runtime.connect(c),
      /authentication|required|connect/,
    );
    await vault.set(
      "one:manual",
      JSON.stringify({ Authorization: "Bearer fixture-token" }),
    );
    let tools = await runtime.connect(c);
    assert.equal(tools.length, 2);
    assert.ok(tools.every((t) => !t.enabled));
    assert.equal(tools[0].requiresApproval, false);
    assert.equal(tools[1].requiresApproval, true);
    const result = await runtime.call(
      c,
      tools[0],
      { sku: "ARC" },
      new AbortController().signal,
    );
    assert.match(result, /24 available/);
    assert.equal(count, 1);
    tools[0].enabled = true;
    c.tools = tools;
    await runtime.disconnect(c.id);
    tools = await runtime.connect(c);
    assert.equal(tools[0].enabled, true);
    await vault.delete("one:manual");
    await assert.rejects(() => runtime.connect(c));
  } finally {
    await runtime.disconnect(c.id);
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});
