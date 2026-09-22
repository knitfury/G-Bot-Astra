import test from "node:test";
import assert from "node:assert/strict";
import { mockServices as services } from "../src/services/mocks";
import { get } from "../src/services/mocks/database";
import {
  connectionAvailable,
  PLAN_LIMITS,
  requiredPlan,
} from "../src/lib/entitlements";
import type { ProviderInput } from "../src/types/domain";
const provider: ProviderInput = {
  name: "Test inference",
  type: "Generic REST",
  baseUrl: "https://inference.example.com",
  key: "demo-key-1234",
  model: "test-model",
  headers: '{"Authorization":"not-a-real-secret"}',
  method: "POST",
  auth: "Bearer",
  body: '{"prompt":"{{input}}"}',
  inputPath: "prompt",
  responsePath: "content",
  tools: true,
};
test("entitlement rules are centralized and downgrade retains all saved configuration", async () => {
  await services.auth.demo();
  const original = JSON.stringify(get().connections);
  await services.entitlements.change("starter");
  assert.equal(
    get().connections.filter((c) => connectionAvailable(get().entitlement, c))
      .length,
    5,
  );
  assert.equal(JSON.stringify(get().connections), original);
  await services.entitlements.change("free");
  assert.equal(
    get().connections.filter((c) => connectionAvailable(get().entitlement, c))
      .length,
    1,
  );
  assert.equal(get().connections.length, 8);
  assert.equal(requiredPlan(0), "free");
  assert.equal(requiredPlan(4), "starter");
  assert.equal(requiredPlan(7), "business");
  assert.deepEqual(PLAN_LIMITS, { free: 1, starter: 5, business: 8 });
});
test("provider credentials and advanced headers never survive save", async () => {
  await services.auth.demo();
  await services.providers.save(provider);
  const saved = get().providers.find((p) => p.name === provider.name)!;
  assert.equal(saved.status, "connected");
  assert.equal(saved.models.length, 2);
  assert.ok(!JSON.stringify(saved).includes("demo-key-1234"));
  assert.ok(!JSON.stringify(saved).includes("not-a-real-secret"));
  assert.equal(get().providers.length, 2);
  await assert.rejects(
    () => services.providers.test({ ...provider, body: "broken" }),
    /JSON/,
  );
  await assert.rejects(
    () => services.providers.test({ ...provider, key: "invalid-key" }),
    /authentication/,
  );
});
test("signature task preserves partial results and retries only the failed tool", async () => {
  await services.auth.demo();
  await services.diagnostics.set({ inventoryFailure: true });
  const cid = await services.conversations.create("model-demo");
  await services.execution.run(
    cid,
    "Find Maya's email, check stock and prepare a response.",
    "model-demo",
    [],
  );
  const message = get().conversations[0].messages.at(-1)!;
  assert.equal(message.status, "failed");
  assert.equal(message.tools[0].status, "completed");
  assert.equal(message.tools[1].status, "failed");
  const completedId = message.tools[0].id;
  await services.diagnostics.set({ inventoryFailure: false });
  await services.execution.retry(cid);
  assert.equal(message.status, "completed");
  assert.equal(message.tools[0].id, completedId);
  assert.match(message.content, /24 in stock/);
  assert.equal(get().activity.filter((a) => a.tool === "email.read").length, 1);
});
test("support action requires approval and rechecks entitlement and tool permission", async () => {
  await services.auth.demo();
  const cid = await services.conversations.create("model-demo");
  await services.execution.run(
    cid,
    "Summarize Leo at Northwind and create a support ticket.",
    "model-demo",
    [],
  );
  const a = get().approvals[0];
  assert.equal(a.status, "pending");
  await services.entitlements.change("free");
  await assert.rejects(() => services.approvals.resolve(a.id, true), /plan/);
  assert.equal(a.status, "pending");
  await services.entitlements.change("business");
  await services.tools.toggle(a.connectionId, a.toolId, false);
  await assert.rejects(
    () => services.approvals.resolve(a.id, true),
    /Permission/,
  );
  await services.tools.toggle(a.connectionId, a.toolId, true);
  await services.approvals.resolve(a.id, true);
  assert.equal(a.status, "approved");
  assert.match(
    get().conversations[0].messages.at(-1)!.content,
    /Support ticket GB-/,
  );
  await assert.rejects(() => services.approvals.resolve(a.id, true), /already/);
});
test("rejecting email has no simulated send side effect; logout clears credential state", async () => {
  await services.auth.demo();
  const cid = await services.conversations.create("model-demo");
  await services.execution.run(
    cid,
    "Find Maya's email, check stock and send a response.",
    "model-demo",
    [],
  );
  const a = get().approvals[0];
  await services.approvals.resolve(a.id, false);
  assert.equal(a.status, "rejected");
  assert.ok(
    !get().activity.some(
      (x) => x.action === "Send customer email" && x.outcome === "completed",
    ),
  );
  await services.auth.logout();
  assert.equal(get().user, null);
  assert.ok(get().providers.every((p) => p.status === "disconnected"));
  assert.ok(get().connections.every((c) => !c.enabled));
});
test("stopping generation cancels remaining steps without approval", async () => {
  await services.auth.demo();
  const cid = await services.conversations.create("model-demo");
  const run = services.execution.run(
    cid,
    "Check Maya stock and send response",
    "model-demo",
    [],
  );
  services.execution.stop(cid);
  await run;
  assert.equal(get().conversations[0].messages.at(-1)!.status, "cancelled");
  assert.equal(get().approvals.length, 0);
});
