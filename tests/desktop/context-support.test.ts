import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Snapshots, snapshotItems } from "../../desktop/runtime/snapshots";
import {
  clearWebCache,
  Shutdown,
  supportURL,
} from "../../desktop/runtime/maintenance";
import { Diagnostics } from "../../desktop/runtime/diagnostics";
import { entitlementFor } from "../../src/lib/entitlements";
import type { MCPConnection } from "../../src/types/domain";
import type { SnapshotConfig } from "../../src/types/snapshot";
import { fixtureRuntime } from "../fixtures/desktop";
import {
  InternalNavigation,
  internalRoute,
} from "../../src/lib/internal-navigation";
function connection(): MCPConnection {
  return {
    id: "c",
    slot: 0,
    name: "Mail",
    category: "Email",
    icon: "Email",
    url: "https://fixture.invalid/mcp",
    auth: "None",
    status: "connected",
    enabled: true,
    lastConnected: "",
    error: "",
    permissionSummary: "",
    maskedCredential: "",
    tools: [
      {
        id: "c:lookup",
        connectionId: "c",
        name: "lookup",
        label: "Lookup",
        description: "Read mailbox",
        risk: "read",
        annotations: { readOnlyHint: true, destructiveHint: false },
        requiresApproval: false,
        enabled: true,
        schemaHash: "v1",
        inputSchema: {
          type: "object",
          required: ["accountId"],
          properties: { accountId: { type: "string" } },
          additionalProperties: false,
        },
      },
    ],
  };
}
const configuration = (c: MCPConnection): SnapshotConfig => ({
  source: "tool",
  name: "lookup",
  binding: "v1",
  endpoint: c.url,
  kind: "mail",
  arguments: { accountId: "selected-account" },
});
test("explicit read parameters hydrate without AI; refresh, emptiness, schema and permissions stay authoritative", async () => {
  const c = connection();
  let calls = 0,
    empty = false;
  const snapshots = new Snapshots(
    () => c,
    () => entitlementFor("free"),
    {
      connect: async () => [],
      disconnect: async () => {},
      call: async (_c, _t, args) => {
        assert.equal(args.accountId, "selected-account");
        calls++;
        return JSON.stringify({
          structuredContent: {
            messages: empty
              ? []
              : [{ subject: "Actual subject", sender: "Customer" }],
          },
        });
      },
    },
    () => {},
  );
  assert.equal((await snapshots.get(c.id)).state, "configuration");
  assert.equal(calls, 0);
  await assert.rejects(() =>
    snapshots.configure(c.id, { ...configuration(c), arguments: {} }),
  );
  await snapshots.configure(c.id, configuration(c));
  assert.equal((await snapshots.get(c.id)).items[0].title, "Actual subject");
  await snapshots.get(c.id);
  assert.equal(calls, 1);
  empty = true;
  assert.equal((await snapshots.get(c.id, true)).state, "empty");
  assert.equal(calls, 2);
  c.tools[0].enabled = false;
  assert.equal((await snapshots.get(c.id, true)).state, "permission");
  assert.equal(calls, 2);
  c.tools[0].enabled = true;
  c.tools[0].schemaHash = "v2";
  assert.equal((await snapshots.get(c.id, true)).state, "configuration");
  assert.equal(calls, 2);
});
test("write/destructive tools and unclassified tools cannot be configured for automatic reads", async () => {
  const c = connection();
  const s = new Snapshots(
    () => c,
    () => entitlementFor("business"),
    {
      connect: async () => [],
      disconnect: async () => {},
      call: async () => {
        throw Error("must never execute");
      },
    },
    () => {},
  );
  for (const risk of ["write", "destructive"] as const) {
    c.tools[0].risk = risk;
    c.tools[0].requiresApproval = true;
    await assert.rejects(() => s.configure(c.id, configuration(c)));
    assert.deepEqual((await s.get(c.id, true)).items, []);
  }
});
test("resources use enabled connection permission automatically; revocation discards in-flight data", async () => {
  const c = connection();
  c.tools = [];
  let calls = 0,
    revoke = false;
  const source = {
    source: "resource" as const,
    name: "mail://recent",
    label: "Mail",
    binding: "r1",
    eligible: true,
    reason: "Read",
  };
  const s = new Snapshots(
    () => c,
    () => entitlementFor("free"),
    {
      connect: async () => [],
      disconnect: async () => {},
      call: async () => {
        throw Error();
      },
      sources: async () => [source],
      readResource: async () => {
        calls++;
        if (revoke) delete c.snapshotConfig;
        return JSON.stringify({
          contents: [
            {
              uri: source.name,
              text: JSON.stringify({
                events: [{ title: "Meeting", start: "2030-01-01" }],
              }),
            },
          ],
        });
      },
    },
    () => {},
  );
  assert.equal((await s.get(c.id)).state, "ready");
  assert.equal(calls, 1);
  await s.configure(c.id, {
    source: "resource",
    name: source.name,
    binding: source.binding,
    endpoint: c.url,
    kind: "calendar",
    arguments: {},
  });
  assert.equal((await s.get(c.id)).items[0].title, "Meeting");
  revoke = true;
  assert.deepEqual((await s.get(c.id, true)).items, []);
});
test("configured field mapping and generic records preserve bounded real values", () => {
  const rows = snapshotItems(
    JSON.stringify({
      structuredContent: {
        envelope: {
          list: [{ custom: { label: "Widget", note: "Actual" }, count: 0 }],
        },
      },
    }),
    "inventory",
    { rows: "envelope.list", title: "custom.label", preview: "custom.note" },
  );
  assert.equal(rows?.[0].title, "Widget");
  assert.equal(rows?.[0].preview, "Actual");
  assert.equal(
    snapshotItems('{"structuredContent":{"count":0}}', "generic")?.[0].fields
      .count,
    "0",
  );
});
test("configured pane preferences survive recreation alongside unrelated preferences", async () => {
  const f = await fixtureRuntime();
  try {
    await f.runtime.services.auth.demo();
    const id = await f.runtime.services.connections.save({
      name: "MCP",
      url: "https://fixture.invalid/mcp",
      category: "Email",
      auth: "None",
      slot: 0,
    });
    await f.runtime.services.connections.connect(id, true);
    const c = f.runtime.db.connections[0];
    await f.runtime.services.tools.toggle(id, c.tools[0].id, true);
    await f.runtime.snapshots.configure(id, {
      endpoint: c.url,
      source: "tool",
      name: "read",
      binding: "fixture-v1",
      kind: "generic",
      arguments: { query: "recent" },
    });
    await f.runtime.services.account.preferences({
      activityVisible: false,
      diagnosticsConsent: true,
      historyRetention: 90,
    });
    await f.runtime.save();
    await f.runtime.init();
    assert.equal(
      f.runtime.db.connections[0].snapshotConfig?.arguments.query,
      "recent",
    );
    assert.equal(f.runtime.db.preferences.activityVisible, false);
    assert.equal(f.runtime.db.preferences.diagnosticsConsent, true);
    assert.equal(f.runtime.db.preferences.historyRetention, 90);
  } finally {
    f.runtime.engine.stopAll();
  }
});
test("cache command clears only cookies and HTTP cache; restart drains and saves once before relaunch", async () => {
  const events: string[] = [];
  await clearWebCache({
    clearCache: async () => {
      events.push("http");
    },
    clearStorageData: async (options) => {
      assert.deepEqual(options, { storages: ["cookies"] });
      events.push("cookies");
    },
  });
  assert.deepEqual(events, ["http", "cookies"]);
  events.length = 0;
  const s = new Shutdown(
    async () => {
      events.push("drain");
    },
    async () => {
      events.push("save");
    },
    (restart) => {
      assert.equal(restart, true);
      events.push("relaunch");
    },
  );
  await Promise.all([s.run(true), s.run(true)]);
  assert.deepEqual(events, ["drain", "save", "relaunch"]);
  let finish = false;
  const failing = new Shutdown(
    async () => {},
    async () => {
      throw Error("disk");
    },
    () => {
      finish = true;
    },
  );
  await assert.rejects(() => failing.run(true));
  assert.equal(finish, false);
  assert.equal(new URL(supportURL).pathname, "gbot@vidinex.ee");
  assert.equal(
    new URL(supportURL).searchParams.get("subject"),
    "G-Bot Support — Desktop",
  );
});
test("diagnostics rotate, prune expired entries and discard content rather than redact arbitrary strings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gbot-logs-"));
  const file = join(dir, "diagnostics.jsonl");
  await writeFile(
    file,
    JSON.stringify({
      time: "2000-01-01",
      event: "ipc_failure",
      code: "NETWORK",
      secret: "old-secret",
    }) +
      "\n" +
      JSON.stringify({
        time: new Date().toISOString(),
        event: "ipc_failure",
        code: "NETWORK",
        token: "secret-canary",
        prompt: "customer-content",
      }) +
      "\n",
  );
  const d = new Diagnostics(
    dir,
    undefined,
    { version: "1.0.0", platform: "win32", osVersion: "test" },
    500,
  );
  for (let i = 0; i < 12; i++) await d.record("renderer_failure", "RENDERER");
  const logs =
    (await readFile(file, "utf8")) +
    (await readFile(file + ".previous", "utf8"));
  assert.ok(!/secret|customer-content|2000-01-01/.test(logs));
  assert.ok(logs.length < 1100);
  assert.ok((await d.recent()).length > 0);
});
test("Back tracks internal routes only, with safe direct-entry fallback", () => {
  const h = new InternalNavigation();
  for (const route of [
    "https://evil.invalid",
    "/portal",
    "//evil.invalid",
    "/login",
  ])
    assert.equal(internalRoute(route), false);
  h.observe("/workspace", null, () => "one");
  h.observe("/settings?section=Advanced", null, () => "two");
  h.observe("/providers", null, () => "three");
  assert.equal(h.canBack("/providers", "three"), true);
  assert.equal(h.canBack("/providers", "unknown"), false);
  h.observe("/settings?section=Advanced", "two", () => "unused");
  assert.equal(h.canBack("/settings?section=Advanced", "two"), true);
  assert.equal(internalRoute("/settings/%2e%2e"), false);
  assert.equal(h.fallback("/connections/id"), "/connections");
  assert.equal(h.fallback("/account"), "/workspace");
  h.observe("/portal", null, () => "none");
  assert.equal(h.canBack("/settings?section=Advanced", "two"), false);
});
