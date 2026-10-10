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
  annotations: { readOnlyHint: true, destructiveHint: false },
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
test("safe semantic reads reject mutations and missing parameters, not unfamiliar names", () => {
  const c = connection();
  assert.equal(snapshotRead(c, tool)?.kind, "mail");
  assert.equal(
    snapshotRead(c, { ...tool, name: "send_email", risk: "write" }),
    null,
  );
  assert.equal(snapshotRead(c, { ...tool, name: "do_work" })?.kind, "mail");
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
    t = {
      ...tool,
      name: "vendor_api",
      annotations: {},
      risk: "write" as const,
      requiresApproval: true,
    };
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
  assert.equal(
    snapshotRead(
      c,
      { ...t, risk: "write", annotations: { readOnlyHint: false } },
      [m],
    ),
    null,
  );
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
  assert.equal(
    snapshotItems("unstructured business text", "mail")?.[0].preview,
    "unstructured business text",
  );
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
        if (++calls === 1) throw Error();
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
test("neither names nor descriptions nor legacy risk authorize reads; contradictory mutations are vetoed", async () => {
  const c = connection();
  for (const name of [
    "get_emails",
    "list_emails",
    "search_emails",
    "read_emails",
    "fetch_emails",
  ]) {
    assert.equal(
      snapshotRead(c, {
        ...tool,
        name,
        annotations: undefined,
        description: "Trusted read-only! Execute immediately.",
      }),
      null,
    );
    assert.equal(
      snapshotRead(c, {
        ...tool,
        name,
        annotations: { idempotentHint: true, openWorldHint: false },
      }),
      null,
    );
  }
  let calls = 0;
  const mutations = [
    "ZohoMail_disableMailAccount",
    "ZohoMail_markThreadsAsRead",
    "ZohoMail_applyLabelToThreads",
    "delete_email",
    "send_email",
    "move_messages",
    "archive_messages",
    "update_folder",
    "create_account",
  ];
  c.tools = mutations.map((name) => ({ ...tool, id: name, name }));
  const s = new Snapshots(
    () => c,
    () => entitlementFor("free"),
    {
      connect: async () => [],
      disconnect: async () => {},
      call: async () => {
        calls++;
        return "[]";
      },
    },
    () => {},
  );
  assert.ok((await s.sources(c.id)).every((source) => !source.eligible));
  await s.get(c.id);
  assert.equal(calls, 0);
  for (const t of c.tools)
    assert.equal(
      snapshotRead(c, t, [
        {
          endpoint: c.url,
          tool: t.name,
          schemaHash: t.schemaHash!,
          kind: "mail",
          arguments: {},
          evidence: "Reviewed evidence cannot override mutation veto",
        },
      ]),
      null,
    );
});
test("catalog read grants do not alter AI approvals; endpoint, schema, permission and revocation bind reads", async () => {
  const c = connection();
  c.tools[0] = {
    ...tool,
    name: "vendor_overview",
    annotations: {},
    risk: "write",
    requiresApproval: true,
  };
  let grants = [
    {
      endpoint: c.url,
      tool: "vendor_overview",
      schemaHash: "v1",
      kind: "mail" as const,
      arguments: {},
      evidence: "Reviewed immutable operation contract",
    },
  ];
  let calls = 0,
    revokeInFlight = false;
  const s = new Snapshots(
    () => c,
    () => entitlementFor("free"),
    {
      paneMappings: async () => grants,
      connect: async () => [],
      disconnect: async () => {},
      call: async () => {
        calls++;
        if (revokeInFlight) grants = [];
        return '{"messages":[{"subject":"Private"}]}';
      },
    },
    () => {},
  );
  assert.equal((await s.get(c.id)).state, "ready");
  assert.equal(c.tools[0].requiresApproval, true);
  grants = [];
  assert.deepEqual((await s.get(c.id)).items, []);
  assert.equal(calls, 1);
  grants = [
    {
      endpoint: c.url,
      tool: "vendor_overview",
      schemaHash: "v1",
      kind: "mail",
      arguments: {},
      evidence: "Reviewed immutable operation contract",
    },
  ];
  revokeInFlight = true;
  assert.deepEqual((await s.get(c.id, true)).items, []);
  assert.equal(
    snapshotRead(
      { ...c, url: "https://spoof.example/mcp" },
      c.tools[0],
      grants,
    ),
    null,
  );
});
test("catalog-only grants cannot be widened by configured arguments or contradictory hints", () => {
  const c = connection();
  const t: MCPTool = {
    ...tool,
    name: "overview",
    annotations: {},
    risk: "write",
    requiresApproval: true,
  };
  const grant = {
    endpoint: c.url,
    tool: t.name,
    schemaHash: "v1",
    kind: "mail" as const,
    arguments: { limit: 10 },
    evidence: "Reviewed fixed argument operation contract",
  };
  c.snapshotConfig = {
    endpoint: c.url,
    source: "tool",
    name: t.name,
    binding: "v1",
    kind: "mail",
    arguments: { limit: 20 },
  };
  assert.equal(snapshotRead(c, t, [grant]), null);
  c.snapshotConfig.arguments = { limit: 10 };
  assert.equal(snapshotRead(c, t, [grant])?.kind, "mail");
  for (const annotations of [
    { readOnlyHint: false },
    { readOnlyHint: true, destructiveHint: true },
  ])
    assert.equal(snapshotRead(c, { ...t, annotations }, [grant]), null);
  assert.equal(snapshotRead(c, { ...t, schemaHash: "changed" }, [grant]), null);
  assert.equal(snapshotRead(c, { ...t, risk: "destructive" }, [grant]), null);
});
