import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as derive,
} from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile, rename, mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { AtomicStore, type SecretVault } from "./storage";
import { DomainError } from "./errors";
const scrypt = promisify(derive);
const envelope = z
  .object({
    version: z.literal(2),
    cipher: z.literal("aes-256-gcm"),
    iv: z.string().length(16),
    tag: z.string().length(24),
    data: z.string().max(400_000_000),
  })
  .strict();
export function seal(plaintext: string, key: Buffer, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    version: 2 as const,
    cipher: "aes-256-gcm" as const,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}
export function unseal(value: unknown, key: Buffer, context: string): string {
  const e = envelope.parse(value),
    cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(e.iv, "base64"));
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(e.tag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(e.data, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
async function atomic(path: string, payload: string) {
  const tmp = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(tmp, payload, { mode: 0o600 });
  const handle = await open(tmp, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, path);
}
export class EncryptedStore<T> extends AtomicStore<T> {
  private pending: Promise<void> = Promise.resolve();
  constructor(
    directory: string,
    name: string,
    private seed: () => T,
    private valid: (v: unknown) => v is T,
    private vault: SecretVault,
  ) {
    super(directory, name, seed, valid);
  }
  private async key(existing: boolean) {
    let stored = await this.vault.get("local-data-key-v2");
    if (!stored) {
      if (existing) throw Error("Missing encryption key");
      stored = randomBytes(32).toString("base64");
      await this.vault.set("local-data-key-v2", stored);
    }
    const key = Buffer.from(stored, "base64");
    if (key.length !== 32) throw Error("Invalid encryption key");
    return key;
  }
  override async read(): Promise<T> {
    await this.pending;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let raw: string;
    try {
      raw = await readFile(join(this.directory, this.name), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return this.seed();
      throw e;
    }
    try {
      const parsed = JSON.parse(raw) as { version?: number; data?: unknown };
      if (parsed.version === 2) {
        const value: unknown = JSON.parse(
          unseal(parsed, await this.key(true), this.name),
        );
        if (!this.valid(value)) throw Error();
        return value;
      }
      const legacy = parsed.version === 1 ? parsed.data : parsed;
      if (!this.valid(legacy)) throw Error();
      // Original stays untouched until new ciphertext is authenticated and atomically committed.
      await this.write(legacy);
      this.recovery = "Local history was migrated to encrypted storage.";
      return legacy;
    } catch {
      throw new DomainError(
        "PERSISTENCE",
        "Encrypted workspace cannot be opened. Original data is preserved. Unlock the OS keychain or restore a verified backup; no empty workspace was created.",
      );
    }
  }
  override write(value: T): Promise<void> {
    const snapshot = JSON.stringify(value);
    const task = this.pending.then(async () => {
      try {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const key = await this.key(false),
          sealed = seal(snapshot, key, this.name);
        if (unseal(sealed, key, this.name) !== snapshot) throw Error();
        await atomic(join(this.directory, this.name), JSON.stringify(sealed));
      } catch {
        throw new DomainError(
          "PERSISTENCE",
          "Encrypted changes could not be saved. Check the keychain, disk space and permissions.",
        );
      }
    });
    this.pending = task.catch(() => {});
    return task;
  }
}
const backupSchema = z
  .object({
    format: z.literal("g-bot-backup"),
    version: z.literal(1),
    salt: z.string().length(24),
    encrypted: envelope,
  })
  .strict();
export async function createBackup(
  value: unknown,
  password: string,
): Promise<string> {
  if (password.length < 12 || password.length > 1024)
    throw Error("Use a backup password of 12–1024 characters");
  const salt = randomBytes(16),
    key = (await scrypt(password, salt, 32)) as Buffer;
  return JSON.stringify({
    format: "g-bot-backup",
    version: 1,
    salt: salt.toString("base64"),
    encrypted: seal(JSON.stringify(value), key, "g-bot-portable-v1"),
  });
}
export async function restoreBackup<T>(
  payload: string,
  password: string,
  valid: (v: unknown) => v is T,
): Promise<T> {
  if (payload.length > 400_000_000 || password.length > 1024)
    throw Error("Backup is too large or password is invalid");
  try {
    const b = backupSchema.parse(JSON.parse(payload)),
      key = (await scrypt(
        password,
        Buffer.from(b.salt, "base64"),
        32,
      )) as Buffer;
    const value: unknown = JSON.parse(
      unseal(b.encrypted, key, "g-bot-portable-v1"),
    );
    if (!valid(value)) throw Error();
    return value;
  } catch {
    throw Error(
      "Wrong password, damaged backup or unsupported version. Existing workspace is unchanged.",
    );
  }
}
