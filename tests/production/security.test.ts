import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signEnvelope } from "../../src/production/server/signing";
import { verifyLicense } from "../../src/production/signed";
import { DAY, effectivePlan } from "../../src/production/model";
import {
  EncryptedStore,
  createBackup,
  restoreBackup,
} from "../../desktop/runtime/encrypted";
import {
  AtomicStore,
  SecretVault,
  stringMap,
} from "../../desktop/runtime/storage";
const account = "11111111-1111-4111-8111-111111111111",
  device = "22222222-2222-4222-8222-222222222222";
test("signed licenses bind device, account, environment, sequence, limits, expiry and clock", () => {
  const pair = generateKeyPairSync("ed25519"),
    privateKey = pair.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString(),
    keys = {
      k: pair.publicKey.export({ format: "pem", type: "spki" }).toString(),
    },
    now = Date.now();
  const value = {
    version: 1,
    issuer: "g-bot",
    environment: "staging",
    account,
    device,
    sequence: 3,
    plan: "starter",
    connections: 5,
    devices: 2,
    issuedAt: now,
    expiresAt: now + 7 * DAY,
    keyId: "k",
  };
  const signed = signEnvelope(value, "k", privateKey),
    expected = {
      account,
      device,
      environment: "staging" as const,
      sequence: 3,
      lastSeen: now,
    };
  assert.equal(verifyLicense(signed, keys, expected, now).plan, "starter");
  for (const override of [
    { account: device },
    { device: account },
    { environment: "production" as const },
    { sequence: 4 },
    { lastSeen: now + 120000 },
  ])
    assert.throws(() =>
      verifyLicense(signed, keys, { ...expected, ...override }, now),
    );
  assert.throws(() => verifyLicense(signed, keys, expected, now + 7 * DAY));
  assert.throws(() =>
    verifyLicense(
      { ...signed, payload: signed.payload.replace("starter", "business") },
      keys,
      expected,
      now,
    ),
  );
  assert.throws(() =>
    verifyLicense(
      signEnvelope({ ...value, expiresAt: now + 8 * DAY }, "k", privateKey),
      keys,
      expected,
      now,
    ),
  );
});
test("billing grace expires exactly after seven days and cancellation retains paid access only through period end", () => {
  const now = Date.now();
  assert.equal(
    effectivePlan(
      {
        plan: "business",
        status: "active",
        periodEnd: now + 1,
        graceStartedAt: null,
      },
      now,
    ),
    "business",
  );
  assert.equal(
    effectivePlan(
      {
        plan: "business",
        status: "active",
        periodEnd: now,
        graceStartedAt: null,
      },
      now,
    ),
    "free",
  );
  assert.equal(
    effectivePlan(
      {
        plan: "starter",
        status: "past_due",
        periodEnd: now - 1,
        graceStartedAt: now - 7 * DAY + 1,
      },
      now,
    ),
    "starter",
  );
  assert.equal(
    effectivePlan(
      {
        plan: "starter",
        status: "past_due",
        periodEnd: now - 1,
        graceStartedAt: now - 7 * DAY,
      },
      now,
    ),
    "free",
  );
});
test("encrypted legacy migration authenticates before replacing; corrupt ciphertext is preserved", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gbot-encrypt-")),
    key = randomBytes(32);
  const { seal, unseal } = await import("../../desktop/runtime/encrypted");
  const vault = new SecretVault(
    new AtomicStore(dir, "vault", () => ({}), stringMap),
    {
      available: async () => true,
      encrypt: async (s) =>
        Buffer.from(JSON.stringify(seal(s, key, "test-os"))),
      decrypt: async (b) => unseal(JSON.parse(b.toString()), key, "test-os"),
    },
  );
  await vault.init();
  const valid = (v: unknown): v is { message: string } =>
    !!v &&
    typeof v === "object" &&
    typeof (v as { message?: unknown }).message === "string";
  await writeFile(
    join(dir, "workspace"),
    JSON.stringify({
      version: 1,
      data: { message: "Sensitive customer conversation" },
    }),
  );
  const store = new EncryptedStore(
    dir,
    "workspace",
    () => ({ message: "" }),
    valid,
    vault,
  );
  assert.equal((await store.read()).message, "Sensitive customer conversation");
  const raw = await readFile(join(dir, "workspace"), "utf8");
  assert.ok(!raw.includes("Sensitive"));
  assert.equal((await store.read()).message, "Sensitive customer conversation");
  const corrupted = JSON.parse(raw);
  corrupted.tag = Buffer.alloc(16).toString("base64");
  const damaged = JSON.stringify(corrupted);
  await writeFile(join(dir, "workspace"), damaged);
  await assert.rejects(store.read());
  assert.equal(await readFile(join(dir, "workspace"), "utf8"), damaged);
});
test("portable backup restores independently; wrong passwords and tampering fail", async () => {
  const valid = (v: unknown): v is { history: string } =>
    !!v &&
    typeof v === "object" &&
    typeof (v as { history?: unknown }).history === "string";
  const backup = await createBackup(
    { history: "private" },
    "a long independent backup password",
  );
  assert.ok(!backup.includes("private"));
  assert.deepEqual(
    await restoreBackup(backup, "a long independent backup password", valid),
    { history: "private" },
  );
  await assert.rejects(restoreBackup(backup, "wrong password", valid));
  await assert.rejects(
    restoreBackup(
      backup.slice(0, -5),
      "a long independent backup password",
      valid,
    ),
  );
});
test("telemetry drops secrets and business payloads before transmission", async () => {
  const { sanitizedTelemetry } =
    await import("../../desktop/runtime/telemetry");
  const value = sanitizedTelemetry({
    version: "1.0.0",
    platform: "win32",
    component: "desktop",
    category: "failure",
    session: account,
    password: "secret",
    prompt: "private",
    request: { headers: { authorization: "Bearer key" } },
    exception: { value: "customer data" },
    attachments: ["private"],
  });
  assert.equal(JSON.stringify(value).includes("private"), false);
  assert.deepEqual(Object.keys(value).sort(), [
    "category",
    "component",
    "platform",
    "session",
    "version",
  ]);
  assert.throws(() =>
    sanitizedTelemetry({ version: "secret", platform: "win32" }),
  );
});
test("update manifest rejects downgrade, wrong platform, stale signatures and installer tampering", async () => {
  const { verifyUpdate, verifyInstaller } =
    await import("../../desktop/runtime/update-integrity");
  const { createHash } = await import("node:crypto");
  const pair = generateKeyPairSync("ed25519"),
    key = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    keys = {
      k: pair.publicKey.export({ format: "pem", type: "spki" }).toString(),
    },
    now = Date.now();
  const payload = {
    version: "1.0.1",
    channel: "stable",
    platform: "win32",
    architecture: "x64",
    file: "G-Bot.exe",
    sha256: createHash("sha256").update("installer").digest("hex"),
    issuedAt: now,
    expiresAt: now + DAY,
  };
  const signed = signEnvelope(payload, "k", key),
    m = verifyUpdate(signed, keys, "1.0.0", "win32", "x64");
  assert.throws(() => verifyUpdate(signed, keys, "1.0.1", "win32", "x64"));
  assert.throws(() => verifyUpdate(signed, keys, "1.0.0", "darwin", "arm64"));
  const dir = await mkdtemp(join(tmpdir(), "gbot-update-")),
    file = join(dir, "installer");
  await writeFile(file, "installer");
  await verifyInstaller(file, m);
  await writeFile(file, "tampered");
  await assert.rejects(verifyInstaller(file, m));
});
