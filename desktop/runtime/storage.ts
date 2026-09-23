import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DomainError } from "./errors";
export interface Protector {
  available(): Promise<boolean>;
  encrypt(value: string): Promise<Buffer>;
  decrypt(value: Buffer): Promise<string>;
}
export class AtomicStore<T> {
  private queue: Promise<void> = Promise.resolve();
  recovery = "";
  constructor(
    readonly directory: string,
    readonly name: string,
    private initial: () => T,
    private validate: (value: unknown) => value is T,
  ) {}
  async read(): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let raw: string;
    try {
      raw = await readFile(join(this.directory, this.name), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return this.initial();
      throw new DomainError(
        "PERSISTENCE",
        "Cannot read local storage. Check disk access.",
      );
    }
    try {
      const envelope = JSON.parse(raw);
      // Explicit legacy migration: unwrapped, otherwise valid local data.
      if (
        envelope &&
        envelope.version === undefined &&
        this.validate(envelope)
      ) {
        await this.write(envelope);
        return envelope;
      }
      if (envelope.version !== 1 || !this.validate(envelope.data))
        throw Error();
      return envelope.data;
    } catch {
      await rename(
        join(this.directory, this.name),
        join(this.directory, `${this.name}.corrupt-${Date.now()}`),
      );
      this.recovery =
        "Unreadable local state was preserved in a recovery file. A fresh workspace was opened.";
      return this.initial();
    }
  }
  write(value: T): Promise<void> {
    const payload = JSON.stringify({ version: 1, data: value });
    const task = this.queue.then(async () => {
      const path = join(this.directory, this.name),
        temp = `${path}.${randomUUID()}.tmp`;
      try {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        await writeFile(temp, payload, { mode: 0o600 });
        await rename(temp, path);
      } catch {
        throw new DomainError(
          "PERSISTENCE",
          "Local changes could not be saved. Check disk space and permissions.",
        );
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
export class SecretVault {
  private values: Record<string, string> = {};
  private mutations: Promise<void> = Promise.resolve();
  private mutate(action: () => Promise<void>) {
    const task = this.mutations.then(action);
    this.mutations = task.catch(() => {});
    return task;
  }
  constructor(
    private store: AtomicStore<Record<string, string>>,
    private protector: Protector,
  ) {}
  async init() {
    this.values = await this.store.read();
  }
  private async ready() {
    if (!(await this.protector.available()))
      throw new DomainError(
        "SECURE_STORAGE",
        "OS credential protection is unavailable. Unlock your keychain and restart; credentials will not be stored unencrypted.",
      );
  }
  async set(id: string, value: string) {
    await this.ready();
    const encrypted = await this.protector.encrypt(value);
    await this.mutate(async () => {
      const next = { ...this.values, [id]: encrypted.toString("base64") };
      await this.store.write(next);
      this.values = next;
    });
  }
  async get(id: string): Promise<string | undefined> {
    await this.mutations;
    if (!this.values[id]) return undefined;
    await this.ready();
    try {
      return await this.protector.decrypt(
        Buffer.from(this.values[id], "base64"),
      );
    } catch {
      throw new DomainError(
        "SECURE_STORAGE",
        "Stored credentials could not be unlocked. Replace the credential.",
      );
    }
  }
  async delete(id: string) {
    await this.mutate(async () => {
      const next = { ...this.values };
      delete next[id];
      await this.store.write(next);
      this.values = next;
    });
  }
  async clear() {
    await this.mutate(async () => {
      await this.store.write({});
      this.values = {};
    });
  }
  has(id: string) {
    return !!this.values[id];
  }
}
export const stringMap = (v: unknown): v is Record<string, string> =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.values(v).every((x) => typeof x === "string");
