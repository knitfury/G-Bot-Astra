import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ErrorCode } from "./errors";
// Intentionally accepts no free-form messages, request arguments, headers or payloads.
export class Diagnostics {
  private queue = Promise.resolve();
  constructor(private directory: string) {}
  record(
    event:
      "ipc_failure" | "storage_failure" | "update_state" | "startup_failure",
    code: ErrorCode | "UPDATE",
  ) {
    this.queue = this.queue
      .then(async () => {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const file = join(this.directory, "diagnostics.jsonl");
        const size = await stat(file)
          .then((s) => s.size)
          .catch(() => 0);
        if (size > 1_000_000) await rename(file, file + ".previous");
        await appendFile(
          file,
          JSON.stringify({ time: new Date().toISOString(), event, code }) +
            "\n",
          { mode: 0o600 },
        );
      })
      .catch(() => {
        /* Diagnostics must not block the user or leak original errors. */
      });
    return this.queue;
  }
}
