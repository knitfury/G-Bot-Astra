import test from "node:test";
import assert from "node:assert/strict";
import { fixtureRuntime } from "../fixtures/desktop";
import {
  activeConnectionCount,
  entitlementFor,
  routersAvailable,
  auditAvailable,
} from "../../src/lib/entitlements";
import { validateRouter } from "../../src/lib/providers";
import { PLANS } from "../../src/production/model";
import { exportAudit, retainActivity } from "../../src/lib/audit";
import { databaseShape } from "../../desktop/runtime/service";
import type { ProviderInput } from "../../src/types/domain";
const router: ProviderInput = {
  name: "Router",
  type: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  key: "fixture-key",
  model: "openrouter/auto",
  headers: "{}",
  method: "POST",
  auth: "Bearer",
  body: "{}",
  inputPath: "",
  responsePath: "",
  tools: true,
};
test("commercial prices, router gates and audit gates match each plan", () => {
  assert.deepEqual(
    Object.values(PLANS).map((p) => [p.monthly, p.annual, p.connections]),
    [
      [0, 0, 1],
      [6, 60, 5],
      [9, 90, 8],
    ],
  );
  for (const plan of ["free", "starter", "business"] as const) {
    const e = entitlementFor(plan);
    assert.equal(routersAvailable(e), plan !== "free");
    assert.equal(auditAvailable(e), plan === "business");
    assert.equal(auditAvailable({ ...e, status: "expired" }), false);
  }
  assert.throws(
    () => validateRouter(router, entitlementFor("free")),
    /require Starter/,
  );
  assert.throws(
    () =>
      validateRouter(
        { ...router, type: "Custom OpenAI-compatible" },
        entitlementFor("free"),
      ),
    /require Starter/,
  );
  assert.throws(
    () =>
      validateRouter({ ...router, model: "other" }, entitlementFor("starter")),
    /automatic/,
  );
  validateRouter(router, entitlementFor("starter"));
  validateRouter(
    {
      ...router,
      type: "OmniRoute",
      model: "auto",
      baseUrl: "http://127.0.0.1:20128/v1",
    },
    entitlementFor("business"),
  );
});
test("saved connections are unlimited by plan, duplicate categories work, activation is reserved atomically and downgrade preserves secrets and tools", async () => {
  const { runtime } = await fixtureRuntime();
  const s = runtime.services;
  const ids: string[] = [];
  for (let i = 0; i < 10; i++)
    ids.push(
      await s.connections.save({
        name: `Store ${i}`,
        url: `https://store${i}.example/mcp`,
        category: "Ecommerce",
        auth: "Token",
        token: "fixture-token",
        slot: i,
      }),
    );
  assert.ok(databaseShape(runtime.db));
  const results = await Promise.allSettled(
    ids.slice(0, 2).map((id) => s.connections.connect(id, true)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(activeConnectionCount(runtime.db.connections), 1);
  await s.connections.disconnect(ids[0]);
  assert.ok(runtime.vault.has(`${ids[0]}:manual`));
  await s.connections.connect(ids[9], true);
  assert.equal(activeConnectionCount(runtime.db.connections), 1);
  await s.entitlements.change("business");
  for (const id of ids.slice(0, 7)) await s.connections.connect(id, true);
  assert.equal(activeConnectionCount(runtime.db.connections), 8);
  await assert.rejects(() => s.connections.connect(ids[8], true), /allowance/);
  const configs = runtime.db.connections.map(({ enabled, status, ...c }) => c);
  await s.entitlements.change("starter");
  assert.equal(activeConnectionCount(runtime.db.connections), 5);
  await s.entitlements.change("free");
  assert.equal(activeConnectionCount(runtime.db.connections), 1);
  assert.deepEqual(
    runtime.db.connections.map(({ enabled, status, ...c }) => c),
    configs,
  );
  assert.equal(runtime.db.connections.length, 10);
  assert.ok(runtime.vault.has(`${ids[9]}:manual`));
  await s.entitlements.change("business");
  assert.equal(
    activeConnectionCount(runtime.db.connections),
    1,
    "upgrade does not silently reactivate connections",
  );
  await runtime.init();
  assert.equal(runtime.db.connections.length, 10);
  assert.ok(databaseShape(runtime.db));
});
test("runtime rejects router configuration and execution on Free; Business audit export excludes approval arguments", async () => {
  const { runtime } = await fixtureRuntime();
  const s = runtime.services;
  await assert.rejects(() => s.providers.save(router), /require Starter/);
  await s.entitlements.change("starter");
  await s.providers.save(router);
  const model = runtime.db.providers[0].models[0].id;
  assert.deepEqual(
    runtime.db.providers[0].models.map((m) => m.identifier),
    ["openrouter/auto"],
  );
  await s.entitlements.change("free");
  await assert.rejects(() => runtime.provider(model), /require Starter/);
  assert.throws(() => exportAudit(runtime.db), /Business/);
  await s.entitlements.change("business");
  const before = runtime.db.conversations;
  runtime.db.activity = [
    {
      id: "old",
      timestamp: "2020-01-01T00:00:00Z",
      actor: "G-Bot",
      conversationId: "",
      connectionId: "",
      tool: "",
      action: "old",
      outcome: "completed",
      approvalRequired: false,
      detail: "",
    },
  ];
  assert.equal(JSON.parse(exportAudit(runtime.db)).activity.length, 1);
  runtime.db.preferences.activityRetention = 30;
  retainActivity(runtime.db);
  assert.equal(runtime.db.activity.length, 0);
  assert.equal(runtime.db.conversations, before);
});
