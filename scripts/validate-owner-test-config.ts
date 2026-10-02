import { createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  publicConfigSchema,
  validatePublicConfig,
} from "../desktop/runtime/public-config";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_GBOT_ENVIRONMENT",
  "GBOT_CONTROL_PLANE_URL",
  "GBOT_LICENSE_PUBLIC_KEYS",
] as const;
const forbidden = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "GBOT_LICENSE_PRIVATE_KEY",
  "GBOT_CATALOG_PRIVATE_KEY",
  "GBOT_UPDATE_PRIVATE_KEY",
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "WIN_CSC_LINK",
  "WIN_CSC_KEY_PASSWORD",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];
const fail = (message: string): never => {
  throw Error(`Owner-test configuration: ${message}`);
};

export function ownerTestConfig(env: Record<string, string | undefined>) {
  for (const name of forbidden)
    if (env[name])
      fail(`${name} must not be supplied to unsigned owner-test packaging`);
  const raw = Object.fromEntries(
    Object.keys(publicConfigSchema.shape)
      .filter((name) => env[name]?.trim())
      .map((name) => [name, env[name]!]),
  );
  const missing = required.filter((name) => !raw[name]);
  if (missing.length)
    fail(`missing repository Actions variables: ${missing.join(", ")}`);
  // Never fall back to development: licenses are bound to this exact environment.
  if (
    !["development", "staging", "production"].includes(
      raw.NEXT_PUBLIC_GBOT_ENVIRONMENT,
    )
  )
    fail(
      "NEXT_PUBLIC_GBOT_ENVIRONMENT must explicitly be development, staging or production and match the control plane",
    );
  try {
    validatePublicConfig(raw);
  } catch {
    fail("invalid public configuration shape or HTTPS URL");
  }
  for (const value of Object.values(raw))
    if (/PRIVATE KEY|(?:sk_(?:live|test)_|whsec_|sb_secret_)/.test(value))
      fail("private/server credential detected in a public field");
  const anon = raw.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(anon)) {
    let role: unknown;
    try {
      if (anon.split(".").length !== 3) throw Error();
      role = JSON.parse(
        Buffer.from(anon.split(".")[1], "base64url").toString(),
      ).role;
    } catch {
      fail("Supabase key must be a public publishable key or an anon-role JWT");
    }
    if (role !== "anon")
      fail("Supabase JWT must have role anon; privileged keys are forbidden");
  }
  for (const name of [
    "GBOT_LICENSE_PUBLIC_KEYS",
    "GBOT_CATALOG_PUBLIC_KEYS",
    "GBOT_UPDATE_PUBLIC_KEYS",
  ]) {
    if (!raw[name]) continue;
    const keys = JSON.parse(raw[name]) as Record<string, string>;
    if (!Object.keys(keys).length)
      fail(`${name} must contain at least one public key`);
    for (const [id, pem] of Object.entries(keys)) {
      try {
        if (
          !id.trim() ||
          !pem.startsWith("-----BEGIN PUBLIC KEY-----") ||
          createPublicKey(pem).asymmetricKeyType !== "ed25519"
        )
          throw Error();
      } catch {
        fail(`${name} must contain named Ed25519 public PEM keys only`);
      }
    }
  }
  if (!!raw.GBOT_UPDATE_PUBLIC_KEYS !== !!raw.GBOT_RELEASE_MANIFEST_URL)
    fail(
      "GBOT_UPDATE_PUBLIC_KEYS and GBOT_RELEASE_MANIFEST_URL must be supplied together or both omitted",
    );
  if (raw.GBOT_SENTRY_DSN && new URL(raw.GBOT_SENTRY_DSN).password)
    fail("GBOT_SENTRY_DSN must not contain a private password");
  return raw;
}

export function checkOwnerTestBundle(
  raw: unknown,
  expected: Record<string, string>,
) {
  try {
    validatePublicConfig(raw);
  } catch {
    fail("bundle contains invalid or non-public fields");
  }
  const actual = raw as Record<string, string>;
  if (
    JSON.stringify(Object.entries(actual).sort()) !==
    JSON.stringify(Object.entries(expected).sort())
  )
    fail(
      "desktop-dist/public-config.json does not match the validated public configuration",
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const expected = ownerTestConfig(process.env);
    if (process.argv.includes("--bundle"))
      checkOwnerTestBundle(
        JSON.parse(readFileSync("desktop-dist/public-config.json", "utf8")),
        expected,
      );
    console.log(
      `Owner-test public configuration validated (${expected.NEXT_PUBLIC_GBOT_ENVIRONMENT}); no values printed.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error &&
        error.message.startsWith("Owner-test configuration:")
        ? error.message
        : "Owner-test configuration: validation failed; check public variables and generated bundle",
    );
    process.exitCode = 1;
  }
}
