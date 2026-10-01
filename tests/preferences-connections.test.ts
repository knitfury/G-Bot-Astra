import test from "node:test";
import assert from "node:assert/strict";
import { initialDatabase, demoConnections } from "../src/data/mocks/seed";
import {
  contextConnections,
  migrateDemoConnections,
} from "../src/lib/connections";
import { normalizePreferences } from "../src/lib/preferences";
import { mockServices as services } from "../src/services/mocks";
import { get } from "../src/services/mocks/database";
import { entitlementFor } from "../src/lib/entitlements";
test("fresh plans have no saved placeholders; entering Demo again preserves settings and user connections", async () => {
  for (const plan of ["free", "starter", "business"] as const) {
    const db = initialDatabase();
    db.entitlement = entitlementFor(plan);
    assert.equal(db.connections.length, 0);
  }
  await services.auth.demo();
  assert.equal(get().connections.length, 0);
  assert.equal(contextConnections(get()).length, 8);
  await services.account.preferences({
    notifications: false,
    activityVisible: false,
  });
  await services.diagnostics.set({ inventoryFailure: true });
  for (let i = 0; i < 2; i++)
    await services.connections.save({
      name: `My mail ${i}`,
      category: "Email",
      url: "https://mail.example/mcp",
      slot: i,
      auth: "None",
    });
  await services.auth.demo();
  assert.equal(get().connections.length, 2);
  assert.ok(get().connections.every((c) => !c.enabled));
  assert.equal(get().preferences.notifications, false);
  assert.equal(get().preferences.activityVisible, false);
  assert.equal(get().diagnostics.inventoryFailure, true);
});
test("legacy fixture migration preserves configured, renamed and disconnected user data", () => {
  const db = initialDatabase();
  const legacy = demoConnections();
  legacy[0].name = "Zoho Mail";
  legacy[6].name = "WorkDrive";
  const saved = {
    ...legacy[0],
    id: "user-mail",
    enabled: false,
    status: "disconnected" as const,
  };
  const edited = { ...legacy[1], name: "My edited CRM" };
  db.connections = [
    legacy[0],
    saved,
    edited,
    { ...legacy[2], userConfigured: true },
  ];
  migrateDemoConnections(db);
  assert.deepEqual(
    db.connections.map((c) => c.id),
    ["user-mail", "app-1", "app-2"],
  );
  assert.equal(db.demoConnections?.length, 1);
  migrateDemoConnections(db);
  assert.equal(db.connections.length, 3);
});
test("missing/corrupt preferences default field by field", () => {
  assert.deepEqual(normalizePreferences(null), {
    startup: true,
    notifications: true,
    activityVisible: true,
  });
  assert.deepEqual(
    normalizePreferences({
      startup: false,
      notifications: "no",
      diagnosticsConsent: true,
      activityRetention: 30,
      historyRetention: 999,
      secret: "must-not-persist",
    }),
    {
      startup: false,
      notifications: true,
      activityVisible: true,
      diagnosticsConsent: true,
      activityRetention: 30,
    },
  );
});
