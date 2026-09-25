import { verify, createPublicKey } from "node:crypto";
import {
  licenseSchema,
  signedSchema,
  catalogSchema,
  PLANS,
  DAY,
  type Signed,
  type License,
  type Catalog,
} from "./model";
export function verifyEnvelope(
  input: unknown,
  keys: Record<string, string>,
): { raw: unknown; signed: Signed } {
  const signed = signedSchema.parse(input);
  const pem = keys[signed.keyId];
  if (
    !pem ||
    !verify(
      null,
      Buffer.from(signed.payload),
      createPublicKey(pem),
      Buffer.from(signed.signature, "base64url"),
    )
  )
    throw Error("Signature verification failed");
  return { raw: JSON.parse(signed.payload) as unknown, signed };
}
export function verifyLicense(
  input: unknown,
  keys: Record<string, string>,
  expected: {
    account: string;
    device: string;
    environment: License["environment"];
    sequence: number;
    lastSeen: number;
  },
  now = Date.now(),
): License {
  const { raw, signed } = verifyEnvelope(input, keys);
  const l = licenseSchema.parse(raw);
  if (
    l.keyId !== signed.keyId ||
    l.account !== expected.account ||
    l.device !== expected.device ||
    l.environment !== expected.environment ||
    l.sequence < expected.sequence ||
    now + 60_000 < expected.lastSeen ||
    l.issuedAt > now + 60_000 ||
    l.expiresAt <= now ||
    l.expiresAt <= l.issuedAt ||
    l.expiresAt - l.issuedAt > 7 * DAY ||
    l.connections !== PLANS[l.plan].connections ||
    l.devices !== PLANS[l.plan].devices
  )
    throw Error(
      "License expired, revoked, replayed or invalid; connect to revalidate",
    );
  return l;
}
export function verifyCatalog(
  input: unknown,
  keys: Record<string, string>,
  sequence = 0,
  now = Date.now(),
): Catalog {
  const c = catalogSchema.parse(verifyEnvelope(input, keys).raw);
  if (
    c.sequence < sequence ||
    c.issuedAt > now + 60_000 ||
    c.expiresAt <= now ||
    c.expiresAt - c.issuedAt > 30 * DAY
  )
    throw Error("Catalog is stale or invalid");
  if (new Set(c.entries.map((e) => e.id)).size !== c.entries.length)
    throw Error("Duplicate catalog identifiers");
  return c;
}
