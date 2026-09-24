import test from "node:test";
import assert from "node:assert/strict";
import {
  Snapshots,
  snapshotRead,
  snapshotItems,
} from "../../desktop/runtime/snapshots";
import { entitlementFor } from "../../src/lib/entitlements";
import type { MCPConnection, MCPTool } from "../../src/types/domain";
const tool: MCPTool = {
  id: "read",
  connectionId: "c",
  name: "list_emails",
  label: "Recent messages",
  description: "Inbox",
  risk: "read",
  requiresApproval: false,
  enabled: true,
  inputSchema: {
    type: "object",
    properties: { limit: { type: "integer", maximum: 20 } },
    additionalProperties: false,
  },
  schemaHash: "v1",
};
function connection(): MCPConnection {
  return {
    id: "c",
    slot: 0,
    name: "Business mail",
    category: "Email",
    icon: "Email",
    url: "https://example.com/mcp",
    auth: "Token",
    status: "connected",
    enabled: true,
    tools: [structuredClone(tool)],
    lastConnected: "",
    error: "",
    permissionSummary: "",
    maskedCredential: "",
  };
}
test("semantic reads reject mutations, required unknown parameters and ambiguous tools", () => {
  const c = connection();
  assert.equal(snapshotRead(c, tool)?.kind, "mail");
  assert.equal(
    snapshotRead(c, { ...tool, name: "send_email", risk: "write" }),
    null,
  );
  assert.equal(snapshotRead(c, { ...tool, name: "do_work" }), null);
  assert.equal(
    snapshotRead(c, {
      ...tool,
      inputSchema: {
        type: "object",
        required: ["accountId"],
        properties: { accountId: { type: "string" } },
      },
    }),
    null,
  );
  assert.equal(snapshotRead(c, { ...tool, requiresApproval: true }), null);
});
test("reviewed mapping binds endpoint and schema, never bypasses read policy", () => {
  const c = connection(),
    t = { ...tool, name: "vendor_api" };
  const m = {
    endpoint: c.url,
    tool: t.name,
    schemaHash: "v1",
    kind: "mail" as const,
    arguments: {},
    evidence: "Acceptance evidence recorded by reviewer",
  };
  assert.equal(snapshotRead(c, t, [m])?.kind, "mail");
  assert.equal(
    snapshotRead({ ...c, url: "https://evil.example/mcp" }, t, [m]),
    null,
  );
  assert.equal(snapshotRead(c, { ...t, schemaHash: "v2" }, [m]), null);
  assert.equal(snapshotRead(c, { ...t, risk: "write" }, [m]), null);
});
test("real service boundary uses authorized reads, caches, refreshes and retains independent failures", async () => {
  const c = connection();
  let calls = 0,
    fail = false;
  const snapshots = new Snapshots(
    () => c,
    () => entitlementFor("free"),
    {
      connect: async () => [],
      disconnect: async () => {},
      call: async () => {
        calls++;
        if (fail) throw Error();
        return JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                messages: [
                  {
                    id: "m",
                    subject: "Customer question",
                    sender: "Maya",
                    preview: "12 lamps please",
                  },
                ],
              }),
            },
          ],
        });
      },
    },
    () => {},
  );
  assert.equal((await snapshots.get("c")).items[0].title, "Customer question");
  await snapshots.get("c");
  assert.equal(calls, 1);
  await snapshots.get("c", true);
  assert.equal(calls, 2);
  fail = true;
  assert.equal((await snapshots.get("c", true)).state, "error");
  c.tools[0].enabled = false;
  assert.equal((await snapshots.get("c")).state, "permission");
  assert.equal(calls, 3);
  c.status = "authorization expired";
  assert.equal((await snapshots.get("c")).state, "disconnected");
});
test("unknown custom and empty inventories are honest; long values remain bounded", () => {
  assert.equal(snapshotItems("unstructured business text", "mail"), null);
  assert.deepEqual(snapshotItems('{"items":[]}', "inventory"), []);
  const rows = snapshotItems(
    JSON.stringify({
      items: [{ sku: "ARC", name: "X".repeat(8000), stock: 0 }],
    }),
    "inventory",
  )!;
  assert.equal(rows[0].fields.Stock, "0");
  assert.equal(rows[0].title.length, 4000);
});
test("partial snapshot and permission revocation in flight do not expose revoked results", async () => {
  const c = connection();
  c.tools.push({ ...tool, id: "second", name: "list_messages" });
  let calls = 0;
  const s = new Snapshots(
    () => c,
    () => entitlementFor("free"),
    {
      connect: async () => [],
      disconnect: async () => {},
      call: async () => {
        if (++calls === 2) throw Error();
        return '{"messages":[{"subject":"Hello"}]}';
      },
    },
    () => {},
  );
  assert.equal((await s.get("c")).state, "partial");
  const revoked = new Snapshots(
    () => c,
    () => entitlementFor("free"),
    {
      connect: async () => [],
      disconnect: async () => {},
      call: async () => {
        c.tools.forEach((t) => (t.enabled = false));
        return '{"messages":[{"subject":"Private"}]}';
      },
    },
    () => {},
  );
  assert.deepEqual((await revoked.get("c")).items, []);
});
