import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Runtime,
  localDatabase,
  databaseShape,
} from "../../desktop/runtime/service";
import {
  AtomicStore,
  SecretVault,
  stringMap,
} from "../../desktop/runtime/storage";
import { DomainError } from "../../desktop/runtime/errors";
import type { Inference, ModelResult } from "../../desktop/adapters/providers";
import type { MCPRuntime } from "../../desktop/adapters/mcp";
import type { MCPTool, ProviderInput } from "../../src/types/domain";
async function setup(
  options: { write?: boolean; fail?: boolean; loop?: boolean } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "gbot-runtime-"));
  const vault = new SecretVault(
    new AtomicStore(dir, "secrets", () => ({}), stringMap),
    {
      available: async () => true,
      encrypt: async (v) => Buffer.from(v),
      decrypt: async (v) => v.toString(),
    },
  );
  let readCalls = 0,
    writeCalls = 0,
    failed = false;
  const mcp: MCPRuntime = {
    connect: async (c) => [
      {
        id: c.id + ":tool",
        connectionId: c.id,
        name: c.name,
        label: c.name,
        description: c.name,
        enabled: false,
        risk: c.slot === 2 ? "write" : "read",
        requiresApproval: c.slot === 2,
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
          additionalProperties: false,
        },
        schemaHash: "schema-v1",
      },
    ],
    disconnect: async () => {},
    call: async (c) => {
      if (c.slot === 2) {
        writeCalls++;
        return "mutation completed";
      }
      if (options.fail && c.slot === 1 && !failed) {
        failed = true;
        throw new DomainError("TOOL_FAILED", "Inventory unavailable");
      }
      readCalls++;
      return c.slot === 0 ? "Email asks for ARC" : "ARC stock: 24";
    },
  };
  const inference: Inference = {
    generate: async (
      _config,
      turns,
      tools,
      _signal,
      delta,
    ): Promise<ModelResult> => {
      if (turns[0].text === "Reply with OK.") return { text: "OK", calls: [] };
      const count = turns.filter((t) => t.role === "tool").length;
      const limit = options.write ? 3 : 2;
      if (count < limit || options.loop) {
        const index = options.loop ? 0 : count;
        return {
          text: "",
          calls: [
            {
              id: `call-${count}`,
              name: tools[index].name,
              arguments: { query: "ARC" },
            },
          ],
        };
      }
      const text = turns.some((t) => t.text.includes("rejected"))
        ? "The action was rejected. Nothing changed."
        : "Completed with the available information.";
      delta(text);
      return { text, calls: [] };
    },
  };
  const store = new AtomicStore(dir, "state", localDatabase, databaseShape),
    runtime = new Runtime(store, vault, inference, mcp, {
      check: async () => {},
      download: async () => {},
    });
  await runtime.init();
  const s = runtime.services;
  await s.auth.demo();
  await s.entitlements.change("business");
  const p: ProviderInput = {
    name: "Fixture",
    type: "OpenAI-compatible",
    baseUrl: "https://provider.example/v1",
    key: "fake-secret",
    model: "fixture",
    headers: "{}",
    method: "POST",
    auth: "Bearer",
    body: "{}",
    inputPath: "prompt",
    responsePath: "text",
    tools: true,
  };
  await s.providers.save(p);
  for (const [slot, name] of [
    "Read email",
    "Read inventory",
    "Send email",
  ].entries()) {
    const id = await s.connections.save({
      name,
      slot,
      url: `https://server${slot}.example/mcp`,
      auth: "None",
      category: slot === 1 ? "Inventory" : "Email",
    });
    await s.connections.connect(id, true);
    await s.tools.toggle(id, runtime.db.connections.at(-1)!.tools[0].id, true);
  }
  const model = runtime.db.providers[0].models[0].id,
    cid = await s.conversations.create(model);
  return {
    runtime,
    s,
    cid,
    model,
    readCalls: () => readCalls,
    writeCalls: () => writeCalls,
    store,
    vault,
    inference,
    mcp,
  };
}
test("autonomous cross-MCP reads complete with durable history and no approval", async () => {
  const f = await setup();
  await f.s.execution.run(f.cid, "Read email and inventory", f.model, []);
  assert.equal(f.readCalls(), 2);
  assert.equal(f.runtime.db.approvals.length, 0);
  assert.equal(
    f.runtime.db.conversations[0].messages.at(-1)?.status,
    "completed",
  );
  assert.ok(!JSON.stringify(await f.s.snapshot()).includes("fake-secret"));
  const restarted = new Runtime(f.store, f.vault, f.inference, f.mcp, {
    check: async () => {},
    download: async () => {},
  });
  await restarted.init();
  assert.equal(restarted.db.conversations[0].messages.length, 2);
  assert.equal(restarted.db.connections.length, 3);
  assert.ok(restarted.db.connections.every((c) => !c.enabled));
});
test("consequential action pauses; reject prevents mutation", async () => {
  const f = await setup({ write: true });
  await f.s.execution.run(f.cid, "Read context and send", f.model, []);
  assert.equal(f.readCalls(), 2);
  assert.equal(f.writeCalls(), 0);
  assert.equal(f.runtime.db.approvals[0].status, "pending");
  await f.s.approvals.resolve(f.runtime.db.approvals[0].id, false);
  assert.equal(f.writeCalls(), 0);
  assert.equal(f.runtime.db.approvals[0].status, "rejected");
});
test("approval binds exact arguments and executes once; changed schema prevents replay", async () => {
  const f = await setup({ write: true });
  await f.s.execution.run(f.cid, "Send after reading", f.model, []);
  const a = f.runtime.db.approvals[0];
  await assert.rejects(
    () => f.s.approvals.resolve(a.id, true, { ...a.inputs, body: "changed" }),
    /new proposal/,
  );
  const tool = f.runtime.db.connections[2].tools[0];
  tool.schemaHash = "changed";
  await assert.rejects(() => f.s.approvals.resolve(a.id, true), /changed/);
  tool.schemaHash = "schema-v1";
  await f.s.approvals.resolve(a.id, true);
  assert.equal(f.writeCalls(), 1);
  assert.equal(a.executionState, "completed");
  await assert.rejects(() => f.s.approvals.resolve(a.id, true), /resolved/);
});
test("partial failure retries only unfinished read and keeps completed context", async () => {
  const f = await setup({ fail: true });
  await f.s.execution.run(f.cid, "Read both", f.model, []);
  assert.equal(f.readCalls(), 1);
  assert.equal(f.runtime.db.conversations[0].messages.at(-1)?.status, "failed");
  await f.s.execution.retry(f.cid);
  assert.equal(f.readCalls(), 2);
  assert.equal(
    f.runtime.db.conversations[0].messages.at(-1)?.status,
    "completed",
  );
});
test("duplicate tool calls stop safely and plan downgrade retains configurations", async () => {
  const f = await setup({ loop: true });
  await f.s.execution.run(f.cid, "Loop", f.model, []);
  assert.equal(f.readCalls(), 1);
  assert.match(
    f.runtime.db.conversations[0].messages.at(-1)!.content,
    /repeated/,
  );
  await f.s.entitlements.change("free");
  assert.equal(f.runtime.db.entitlement.maxActiveConnections, 1);
  assert.equal(f.runtime.db.connections.length, 3);
  await assert.rejects(
    () => f.s.connections.connect(f.runtime.db.connections[1].id, true),
    /allowance is full/,
  );
  await f.s.entitlements.change("starter");
  assert.equal(f.runtime.db.entitlement.maxActiveConnections, 5);
});
test("invalid arguments and hallucinated tools never reach MCP", async () => {
  const f = await setup();
  f.inference.generate = async (_p, _turns, tools) => ({
    text: "",
    calls: [{ id: "bad", name: tools[0].name, arguments: { query: 123 } }],
  });
  await f.s.execution.run(f.cid, "Invalid", f.model, []);
  assert.equal(f.readCalls(), 0);
  assert.match(
    f.runtime.db.conversations[0].messages.at(-1)!.content,
    /schema/,
  );
  f.inference.generate = async () => ({
    text: "",
    calls: [{ id: "missing", name: "hallucinated", arguments: {} }],
  });
  await f.s.execution.run(f.cid, "Missing", f.model, []);
  assert.equal(f.readCalls(), 0);
  assert.match(
    f.runtime.db.conversations[0].messages.at(-1)!.content,
    /unavailable/,
  );
});
test("distinct tool calls stop at the bounded loop limit", async () => {
  const f = await setup();
  let i = 0;
  f.inference.generate = async (_p, _turns, tools) => ({
    text: "",
    calls: [
      { id: String(++i), name: tools[0].name, arguments: { query: String(i) } },
    ],
  });
  await f.s.execution.run(f.cid, "Loop", f.model, []);
  assert.equal(f.readCalls(), 12);
  assert.match(
    f.runtime.db.conversations[0].messages.at(-1)!.content,
    /12-step/,
  );
});
test("restart cancels pending approvals and marks started writes uncertain", async () => {
  const f = await setup({ write: true });
  await f.s.execution.run(f.cid, "Send", f.model, []);
  f.runtime.db.approvals[0].executionState = "started";
  await f.runtime.save();
  const restarted = new Runtime(f.store, f.vault, f.inference, f.mcp, {
    check: async () => {},
    download: async () => {},
  });
  await restarted.init();
  assert.equal(restarted.db.approvals[0].status, "cancelled");
  assert.equal(restarted.db.approvals[0].executionState, "uncertain");
  await assert.rejects(
    () =>
      restarted.services.approvals.resolve(restarted.db.approvals[0].id, true),
    /resolved/,
  );
  assert.equal(f.writeCalls(), 0);
});
test("malformed nested persisted state is rejected before runtime hydration", () => {
  const db = localDatabase();
  (db as unknown as { connections: unknown[] }).connections = [{ id: "bad" }];
  assert.equal(databaseShape(db), false);
});
