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

test("desktop bundles accept only public configuration and HTTPS endpoints", async () => {
  const { validatePublicConfig } =
    await import("../../desktop/runtime/public-config");
  assert.deepEqual(
    validatePublicConfig({
      GBOT_CONTROL_PLANE_URL: "https://account.example.com",
    }),
    { GBOT_CONTROL_PLANE_URL: "https://account.example.com" },
  );
  assert.throws(() =>
    validatePublicConfig({ SUPABASE_SERVICE_ROLE_KEY: "secret" }),
  );
  assert.throws(() =>
    validatePublicConfig({
      GBOT_CONTROL_PLANE_URL: "http://account.example.com",
    }),
  );
  assert.throws(() =>
    validatePublicConfig({ GBOT_LICENSE_PUBLIC_KEYS: '{"k":123}' }),
  );
});

test("operational notification templates contain only account notices and safe support links", async () => {
  const { notification, noticeKind } =
    await import("../../src/production/server/notifications");
  for (const kind of noticeKind.options) {
    const rendered = notification(kind, "https://account.example.com");
    assert.match(rendered.textContent, /gbot@vidinex.ee/);
    assert.match(rendered.textContent, /https:\/\/account.example.com\/portal/);
    assert.ok(!JSON.stringify(rendered).includes("undefined"));
  }
});

test("release manifest generator signs the exact updater artifact with the runtime schema", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdir, rm } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const directory = await mkdtemp(join(tmpdir(), "gbot-manifest-"));
  const pair = generateKeyPairSync("ed25519");
  try {
    await mkdir(join(directory, "release"));
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ version: "1.0.1" }),
    );
    await writeFile(
      join(directory, "release", "G-Bot-1.0.1.exe"),
      "synthetic updater test bytes",
    );
    const script = pathToFileURL(
      resolve("scripts/sign-release-manifest.mjs"),
    ).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `Object.defineProperty(process,'platform',{value:'win32'});await import(${JSON.stringify(script)});`,
      ],
      {
        cwd: directory,
        env: {
          ...process.env,
          GBOT_UPDATE_KEY_ID: "fixture",
          GBOT_UPDATE_PRIVATE_KEY: pair.privateKey
            .export({ format: "pem", type: "pkcs8" })
            .toString(),
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const { verifyUpdate, verifyInstaller } =
      await import("../../desktop/runtime/update-integrity");
    const manifest = verifyUpdate(
      JSON.parse(
        await readFile(
          join(directory, "release", `stable-win32-${process.arch}.json`),
          "utf8",
        ),
      ),
      {
        fixture: pair.publicKey
          .export({ format: "pem", type: "spki" })
          .toString(),
      },
      "1.0.0",
      "win32",
      process.arch,
    );
    await verifyInstaller(join(directory, "release", manifest.file), manifest);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("catalog high-water survives expired cache and signed emergency control only pauses its feature", async () => {
  const { CatalogClient } = await import("../../desktop/runtime/catalog");
  const values = new Map<string, string>([["catalog-sequence", "6"]]);
  const vault = {
    get: async (k: string) => values.get(k),
    set: async (k: string, v: string) => {
      values.set(k, v);
    },
  } as unknown as SecretVault;
  const pair = generateKeyPairSync("ed25519"),
    keys = {
      k: pair.publicKey.export({ format: "pem", type: "spki" }).toString(),
    },
    key = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const document = (sequence: number) =>
    signEnvelope(
      {
        version: 1,
        sequence,
        issuedAt: Date.now(),
        expiresAt: Date.now() + DAY,
        entries: [],
        disabledFeatures: ["updates"],
      },
      "k",
      key,
    );
  const prior = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json(document(5));
    const catalog = new CatalogClient(vault, "https://account.example", keys);
    assert.equal((await catalog.get()).catalog, null);
    assert.equal(values.get("catalog-sequence"), "6");
    globalThis.fetch = async () => Response.json(document(7));
    await assert.rejects(catalog.assertAllowed("", "updates"), /paused/);
    await catalog.assertAllowed("https://custom.example/mcp");
    assert.equal(values.get("catalog-sequence"), "7");
  } finally {
    globalThis.fetch = prior;
  }
});
test("signing out before auth client initialization clears persisted identity and offline license only", async () => {
  const { ProductionIdentity } = await import("../../desktop/runtime/identity");
  const values = new Map([
    ["identity:session", "fixture"],
    ["offline-license", "fixture"],
    ["local-data-key-v2", "retain"],
    ["device-id", "retain"],
  ]);
  const vault = {
    delete: async (k: string) => {
      values.delete(k);
    },
    deleteMatching: async (fn: (k: string) => boolean) => {
      for (const k of values.keys()) if (fn(k)) values.delete(k);
    },
  } as unknown as SecretVault;
  const identity = new ProductionIdentity(
    vault,
    {
      supabaseUrl: "",
      anonKey: "",
      controlOrigin: "https://account.example",
      environment: "development",
      publicKeys: {},
      version: "1.0.0",
      platform: "win32",
    },
    async () => {},
    async () => {},
  );
  await identity.logout();
  assert.deepEqual([...values.keys()], ["local-data-key-v2", "device-id"]);
});
