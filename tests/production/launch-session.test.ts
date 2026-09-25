import test from "node:test";
import assert from "node:assert/strict";
import { fixtureRuntime } from "../fixtures/desktop";
import { ProductionIdentity } from "../../desktop/runtime/identity";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Fixture",
  email: "fixture@example.invalid",
  avatar: "",
  status: "active" as const,
  createdAt: new Date().toISOString(),
};
test("startup validates persisted identity, restores access, and rejects expired/revoked sessions without erasing data", async () => {
  let attempts = 0,
    valid = true;
  const identity = {
    ensure: async () => {
      attempts++;
      if (!valid) throw Error("revoked");
      return { account: user.id, plan: "starter" };
    },
    logout: async () => {},
  } as unknown as ProductionIdentity;
  const { runtime } = await fixtureRuntime(identity);
  await runtime.restoreSession();
  assert.equal(attempts, 0);
  assert.equal(runtime.db.user, null);
  runtime.db.user = user;
  await runtime.save();
  await runtime.init();
  await runtime.restoreSession();
  assert.equal(attempts, 1);
  assert.equal(runtime.db.user?.id, user.id);
  assert.equal(runtime.db.entitlement.status, "active");
  valid = false;
  const before = JSON.stringify(runtime.db.conversations);
  await runtime.init();
  await runtime.restoreSession();
  assert.equal(runtime.db.user, null);
  assert.equal(runtime.db.entitlement.status, "expired");
  assert.match(
    runtime.db.runtime?.sessionNotice ?? "",
    /local data is retained/,
  );
  assert.equal(JSON.stringify(runtime.db.conversations), before);
  runtime.db.user = user;
  await runtime.services.auth.logout();
  assert.equal(runtime.db.user, null);
});
test("unconfigured Google and Microsoft fail before browser launch without exposing config", async () => {
  const { runtime } = await fixtureRuntime();
  let launched = 0;
  const identity = new ProductionIdentity(
    runtime.vault,
    {
      supabaseUrl: "",
      anonKey: "",
      controlOrigin: "https://account.example",
      environment: "development",
      publicKeys: {},
      version: "1.0.0",
      platform: "win32",
    },
    async () => {
      launched++;
    },
    async () => {},
  );
  for (const [provider, label] of [
    ["google", "Google"],
    ["azure", "Microsoft"],
  ] as const)
    await assert.rejects(
      identity.browser(provider),
      (error) =>
        error instanceof Error &&
        error.message.startsWith(
          `${label} sign-in isn't configured for this environment yet.`,
        ) &&
        !error.message.includes("SUPABASE"),
    );
  assert.equal(launched, 0);
});
