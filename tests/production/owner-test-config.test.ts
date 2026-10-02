import test from "node:test";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ownerTestConfig,
  checkOwnerTestBundle,
} from "../../scripts/validate-owner-test-config";
const pair = generateKeyPairSync("ed25519");
const publicKeys = JSON.stringify({
  "staging-1": pair.publicKey.export({ type: "spki", format: "pem" }),
});
const fixture = {
  NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_fixture",
  NEXT_PUBLIC_GBOT_ENVIRONMENT: "staging",
  GBOT_CONTROL_PLANE_URL: "https://staging.example.invalid",
  GBOT_LICENSE_PUBLIC_KEYS: publicKeys,
};
const jwt = (role: string) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;

test("owner-test configuration requires explicit complete account configuration and preserves environment", () => {
  for (const environment of ["development", "staging", "production"])
    assert.equal(
      ownerTestConfig({ ...fixture, NEXT_PUBLIC_GBOT_ENVIRONMENT: environment })
        .NEXT_PUBLIC_GBOT_ENVIRONMENT,
      environment,
    );
  for (const name of Object.keys(fixture))
    assert.throws(
      () => ownerTestConfig({ ...fixture, [name]: "" }),
      /missing repository Actions variables/,
    );
  assert.throws(
    () =>
      ownerTestConfig({ ...fixture, NEXT_PUBLIC_GBOT_ENVIRONMENT: "sandbox" }),
    /must explicitly/,
  );
  assert.throws(
    () =>
      ownerTestConfig({
        ...fixture,
        GBOT_CONTROL_PLANE_URL: "http://example.invalid",
      }),
    /HTTPS/,
  );
  assert.equal(
    ownerTestConfig({ ...fixture, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon") })
      .NEXT_PUBLIC_SUPABASE_ANON_KEY,
    jwt("anon"),
  );
});

test("owner-test validation rejects server/signing credentials, privileged JWTs and private PEMs", () => {
  for (const name of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "GBOT_LICENSE_PRIVATE_KEY",
    "GBOT_CATALOG_PRIVATE_KEY",
    "GBOT_UPDATE_PRIVATE_KEY",
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "APPLE_APP_SPECIFIC_PASSWORD",
  ])
    assert.throws(
      () => ownerTestConfig({ ...fixture, [name]: "fixture-private" }),
      /must not be supplied/,
    );
  for (const value of [
    jwt("service_role"),
    "sb_secret_fixture",
    "sk_test_fixture",
    "whsec_fixture",
    "arbitrary",
  ])
    assert.throws(() =>
      ownerTestConfig({ ...fixture, NEXT_PUBLIC_SUPABASE_ANON_KEY: value }),
    );
  for (const value of [
    "{}",
    "invalid",
    JSON.stringify({ key: "invalid" }),
    JSON.stringify({
      key: pair.privateKey.export({ type: "pkcs8", format: "pem" }),
    }),
  ])
    assert.throws(() =>
      ownerTestConfig({ ...fixture, GBOT_LICENSE_PUBLIC_KEYS: value }),
    );
  const config = ownerTestConfig({
    ...fixture,
    UNRELATED_SETTING: "not-bundled",
  });
  assert.equal("UNRELATED_SETTING" in config, false);
  assert.throws(
    () =>
      checkOwnerTestBundle({ ...config, STRIPE_SECRET_KEY: "fixture" }, config),
    /non-public/,
  );
});

test("optional catalog, update and diagnostics configuration stays public and bundle must match exactly", () => {
  const config = ownerTestConfig({
    ...fixture,
    GBOT_CATALOG_PUBLIC_KEYS: publicKeys,
    GBOT_UPDATE_PUBLIC_KEYS: publicKeys,
    GBOT_RELEASE_MANIFEST_URL: "https://staging.example.invalid/stable.json",
    GBOT_SENTRY_DSN: "https://public@example.invalid/1",
  });
  checkOwnerTestBundle(config, config);
  assert.throws(() => checkOwnerTestBundle({}, config), /does not match/);
  assert.throws(
    () =>
      checkOwnerTestBundle(
        { ...config, NEXT_PUBLIC_GBOT_ENVIRONMENT: "production" },
        config,
      ),
    /does not match/,
  );
  assert.throws(
    () => ownerTestConfig({ ...fixture, GBOT_UPDATE_PUBLIC_KEYS: publicKeys }),
    /supplied together/,
  );
  assert.throws(
    () =>
      ownerTestConfig({
        ...fixture,
        GBOT_SENTRY_DSN: "https://public:private@example.invalid/1",
      }),
    /private password/,
  );
});

test("owner-test CLI fails closed before packaging and verifies the emitted public-config file", () => {
  const dir = mkdtempSync(join(tmpdir(), "gbot-owner-config-"));
  const cli = fileURLToPath(
    new URL("../../scripts/validate-owner-test-config.ts", import.meta.url),
  );
  const run = (env: Record<string, string>, args: string[] = []) =>
    spawnSync(
      process.execPath,
      ["--import", createRequire(import.meta.url).resolve("tsx"), cli, ...args],
      { cwd: dir, env: { ...process.env, ...env }, encoding: "utf8" },
    );
  try {
    const missing = run({ ...fixture, NEXT_PUBLIC_SUPABASE_URL: "" });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /NEXT_PUBLIC_SUPABASE_URL/);
    const valid = run(fixture);
    assert.equal(valid.status, 0, valid.stderr);
    assert.ok(!valid.stdout.includes(fixture.NEXT_PUBLIC_SUPABASE_ANON_KEY));
    mkdirSync(join(dir, "desktop-dist"));
    writeFileSync(join(dir, "desktop-dist/public-config.json"), "{}");
    assert.equal(run(fixture, ["--bundle"]).status, 1);
    writeFileSync(
      join(dir, "desktop-dist/public-config.json"),
      JSON.stringify(fixture),
    );
    assert.equal(run(fixture, ["--bundle"]).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CI separates smoke fixtures from opted-in public-only unsigned owner artifacts", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const step = workflow
    .split("- name: Package configured unsigned owner-test installer")[1]
    .split("- name: Explain disabled")[0];
  assert.match(step, /vars.GBOT_OWNER_TEST_ENABLED == 'true'/);
  assert.match(step, /shell: bash/); // GitHub bash -e stops on preflight failure, including on Windows.
  assert.match(step, /CSC_IDENTITY_AUTO_DISCOVERY: false/);
  assert.match(
    step,
    /--publish never --config.directories.output=release-owner-test/,
  );
  assert.doesNotMatch(workflow, /secrets\.|environment: release-signing/);
  for (const name of Object.keys(
    ownerTestConfig({
      ...fixture,
      GBOT_CATALOG_PUBLIC_KEYS: publicKeys,
      GBOT_UPDATE_PUBLIC_KEYS: publicKeys,
      GBOT_RELEASE_MANIFEST_URL: "https://example.invalid/stable.json",
      GBOT_SENTRY_DSN: "https://public@example.invalid/1",
    }),
  ))
    assert.ok(step.includes(`${name}: \u0024{{ vars.${name} }}`), name);
  assert.ok(
    step.indexOf("validate-owner-test-config.ts\n") <
      step.indexOf("npm run desktop:build"),
  );
  assert.ok(step.indexOf("--bundle") < step.indexOf("npx electron-builder"));
  assert.match(workflow, /release-owner-test\/\*\.exe/);
  assert.ok(
    workflow.indexOf("smoke-electron.mjs --packaged") <
      workflow.indexOf("Package configured unsigned owner-test"),
  );
});
