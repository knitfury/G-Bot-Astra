import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { signEnvelope } from "../../src/production/server/signing";
import { verifyCatalog } from "../../src/production/signed";
import { CatalogClient } from "../../desktop/runtime/catalog";
import type { SecretVault } from "../../desktop/runtime/storage";
test("signed pane grants require v2, signature, freshness, sequence and a recommended exact endpoint", async () => {
  const pair = generateKeyPairSync("ed25519");
  const key = pair.privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  const keys = {
    fixture: pair.publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
  const now = Date.now();
  const entry = {
    id: "mail",
    name: "Mail",
    icon: "mail",
    category: "Email & Communication",
    description: "",
    useCases: [],
    setup: "",
    auth: "OAuth",
    endpoint: "https://fixture.invalid/mcp",
    docs: "https://fixture.invalid/docs",
    transport: "streamable-http",
    minimumVersion: "1.0.0",
    status: "recommended",
    reviewedAt: new Date().toISOString(),
    evidence: "Fixture reviewed operation evidence",
  };
  const grant = {
    endpoint: entry.endpoint,
    tool: "overview",
    schemaHash: "a".repeat(64),
    label: "Recent mail",
    kind: "mail",
    arguments: {},
    evidence: "Fixture reviewed operation evidence",
  };
  const doc = {
    version: 2,
    sequence: 2,
    issuedAt: now,
    expiresAt: now + 60000,
    entries: [entry],
    disabledFeatures: [],
    paneReads: [grant],
  };
  const signed = signEnvelope(doc, "fixture", key);
  assert.equal(verifyCatalog(signed, keys).paneReads?.length, 1);
  assert.throws(() =>
    verifyCatalog(
      { ...signed, payload: signed.payload.replace("overview", "other") },
      keys,
    ),
  );
  assert.throws(() => verifyCatalog(signed, keys, 3));
  assert.throws(() => verifyCatalog(signed, keys, 0, now + 60001));
  assert.throws(() =>
    verifyCatalog(signEnvelope({ ...doc, version: 1 }, "fixture", key), keys),
  );
  const { paneReads: _, ...v1 } = doc;
  assert.equal(
    verifyCatalog(signEnvelope({ ...v1, version: 1 }, "fixture", key), keys)
      .version,
    1,
  );
  const vault = {
    get: async () => undefined,
    set: async () => {},
  } as unknown as SecretVault;
  const client = new CatalogClient(vault, "https://fixture.invalid", keys);
  let current = verifyCatalog(signed, keys);
  client.get = async () => ({ catalog: current, cached: false, message: "" });
  assert.equal((await client.paneMappings()).length, 1);
  current = {
    ...current,
    entries: [{ ...current.entries[0], status: "disabled" }],
  };
  assert.deepEqual(await client.paneMappings(), []);
  current = {
    ...current,
    entries: [
      {
        ...current.entries[0],
        status: "recommended",
        endpoint: "https://spoof.invalid/mcp",
      },
    ],
  };
  assert.deepEqual(await client.paneMappings(), []);
  current = {
    ...current,
    entries: [verifyCatalog(signed, keys).entries[0]],
    disabledFeatures: ["recommended"],
  };
  assert.deepEqual(await client.paneMappings(), []);
});
