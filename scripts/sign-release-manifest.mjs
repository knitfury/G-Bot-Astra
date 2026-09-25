import { createHash, createPrivateKey, sign } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const keyId = process.env.GBOT_UPDATE_KEY_ID,
  key = process.env.GBOT_UPDATE_PRIVATE_KEY;
if (!keyId || !key)
  throw Error("BLOCKED — external prerequisite: release manifest signing key");
if (!["win32", "darwin"].includes(process.platform))
  throw Error("Unsupported release platform");
const names = (await readdir("release")).filter((name) =>
  process.platform === "win32" ? name.endsWith(".exe") : name.endsWith(".zip"),
);
if (names.length !== 1)
  throw Error("Exactly one updater installer must be selected per release job");
const file = join("release", names[0]),
  hash = createHash("sha256");
for await (const chunk of createReadStream(file)) hash.update(chunk);
const now = Date.now();
const value = {
  version: pkg.version,
  channel: "stable",
  platform: process.platform,
  architecture: process.arch,
  file: basename(file),
  sha256: hash.digest("hex"),
  issuedAt: now,
  expiresAt: now + 7 * 86400000,
};
const payload = JSON.stringify(value);
const envelope = {
  payload,
  keyId,
  signature: sign(
    null,
    Buffer.from(payload),
    createPrivateKey(key.replace(/\\n/g, "\n")),
  ).toString("base64url"),
};
await writeFile(
  `release/stable-${process.platform}-${process.arch}.json`,
  JSON.stringify(envelope, null, 2),
);
console.log("Signed update manifest created. Nothing was published.");
