import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { z } from "zod";
import { verifyEnvelope } from "../../src/production/signed";
export const updateSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    channel: z.literal("stable"),
    platform: z.enum(["win32", "darwin"]),
    architecture: z.enum(["x64", "arm64"]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    issuedAt: z.number(),
    expiresAt: z.number(),
    file: z.string().regex(/^[A-Za-z0-9._ -]+\.(exe|zip|dmg)$/),
  })
  .strict();
export type UpdateManifest = z.infer<typeof updateSchema>;
export function newer(candidate: string, current: string) {
  const a = candidate.split(".").map(Number),
    b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}
export function verifyUpdate(
  input: unknown,
  keys: Record<string, string>,
  current: string,
  platform: string,
  architecture: string,
  now = Date.now(),
): UpdateManifest {
  const m = updateSchema.parse(verifyEnvelope(input, keys).raw);
  if (
    !newer(m.version, current) ||
    m.platform !== platform ||
    m.architecture !== architecture ||
    m.issuedAt > now + 60000 ||
    m.expiresAt <= now ||
    m.expiresAt - m.issuedAt > 30 * 86400000
  )
    throw Error(
      "Update manifest is invalid, stale or not newer than this version.",
    );
  return m;
}
export async function verifyInstaller(path: string, manifest: UpdateManifest) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest("hex") !== manifest.sha256)
    throw Error("Downloaded installer does not match its signed checksum.");
}
