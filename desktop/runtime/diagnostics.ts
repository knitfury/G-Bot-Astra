import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SafeTelemetry } from "./telemetry";
import type { ErrorCode } from "./errors";
export type DiagnosticEvent =
  | "ipc_failure"
  | "storage_failure"
  | "update_state"
  | "startup_failure"
  | "renderer_failure"
  | "main_failure"
  | "mcp_connected"
  | "mcp_unavailable"
  | "ai_started"
  | "ai_completed"
  | "ai_failed"
  | "snapshot_ready"
  | "snapshot_failed"
  | "maintenance"
  | "startup";
const events: DiagnosticEvent[] = [
  "ipc_failure",
  "storage_failure",
  "update_state",
  "startup_failure",
  "renderer_failure",
  "main_failure",
  "mcp_connected",
  "mcp_unavailable",
  "ai_started",
  "ai_completed",
  "ai_failed",
  "snapshot_ready",
  "snapshot_failed",
  "maintenance",
  "startup",
];
const codes = new Set([
  "UPDATE",
  "HEALTH",
  "RENDERER",
  "MAIN",
  "CACHE",
  "RESTART",
  "PERSISTENCE",
  "INVALID_ARGUMENTS",
  "CAPABILITY",
  "CANCELLED",
  "SECURE_STORAGE",
  "NETWORK",
  "PROVIDER_AUTH",
  "RATE_LIMIT",
  "TIMEOUT",
  "APPROVAL_REJECTED",
  "MCP_PROTOCOL",
  "MCP_AUTH",
  "MCP_UNAVAILABLE",
  "MCP_EXPIRED",
  "TOOL_FAILED",
  "TOOL_UNAVAILABLE",
  "ENTITLEMENT",
]);
export class Diagnostics {
  private queue = Promise.resolve();
  constructor(
    readonly directory: string,
    private telemetry?: SafeTelemetry,
    private metadata = {
      version: "1.0.0",
      platform: process.platform as string,
      osVersion: "unknown",
    },
    private maxBytes = 1_000_000,
  ) {}
  fatal() {
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      writeFileSync(
        join(this.directory, "fatal.json"),
        JSON.stringify({
          time: new Date().toISOString(),
          event: "main_failure",
          code: "MAIN",
          severity: "error",
          ...this.metadata,
          subsystem: "main",
        }) + "\n",
        { mode: 0o600 },
      );
    } catch {
      /* Never interfere with the fatal exit. */
    }
  }
  flush() {
    return this.queue;
  }
  async recent() {
    await this.queue;
    const raw = await readFile(
      join(this.directory, "diagnostics.jsonl"),
      "utf8",
    ).catch(() => "");
    const fatal = await readFile(
      join(this.directory, "fatal.json"),
      "utf8",
    ).catch(() => "");
    return this.clean(raw + "\n" + fatal)
      .slice(-10)
      .map((row) => {
        const r = JSON.parse(row);
        return { time: r.time, event: r.event, code: r.code };
      });
  }
  private clean(raw: string) {
    return raw
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const r = JSON.parse(line);
          if (
            Date.parse(r.time) < Date.now() - 30 * 86400000 ||
            !Number.isFinite(Date.parse(r.time)) ||
            !events.includes(r.event) ||
            !codes.has(r.code)
          )
            return [];
          // Reconstruct the allowlisted record; never preserve arbitrary imported fields.
          return [
            JSON.stringify({
              time: r.time,
              event: r.event,
              code: r.code,
              severity: r.severity === "error" ? "error" : "info",
              version: this.metadata.version,
              platform: this.metadata.platform,
              osVersion: this.metadata.osVersion,
              subsystem: r.event.split("_")[0],
            }),
          ];
        } catch {
          return [];
        }
      });
  }
  record(
    event: DiagnosticEvent,
    code:
      | ErrorCode
      | "UPDATE"
      | "HEALTH"
      | "RENDERER"
      | "MAIN"
      | "CACHE"
      | "RESTART",
  ) {
    if (!events.includes(event)) return this.queue;
    const safeCode = codes.has(code) ? code : "CAPABILITY";
    this.queue = this.queue
      .then(async () => {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const file = join(this.directory, "diagnostics.jsonl");
        const fatal = this.clean(
          await readFile(join(this.directory, "fatal.json"), "utf8").catch(
            () => "",
          ),
        );
        await writeFile(join(this.directory, "fatal.json"), fatal.join("\n"), {
          mode: 0o600,
        });
        const current = this.clean(
          await readFile(file, "utf8").catch(() => ""),
        );
        let previous = this.clean(
          await readFile(file + ".previous", "utf8").catch(() => ""),
        );
        const row = JSON.stringify({
          time: new Date().toISOString(),
          event,
          code: safeCode,
          severity: /failure|failed|unavailable/.test(event) ? "error" : "info",
          ...this.metadata,
          subsystem: event.split("_")[0],
        });
        if (Buffer.byteLength([...current, row].join("\n")) > this.maxBytes) {
          previous.splice(0, previous.length, ...current);
          current.length = 0;
        }
        while (Buffer.byteLength(previous.join("\n")) > this.maxBytes)
          previous.shift();
        current.push(row);
        await writeFile(
          file + ".previous",
          previous.join("\n") + (previous.length ? "\n" : ""),
          { mode: 0o600 },
        );
        await writeFile(file, current.join("\n") + "\n", { mode: 0o600 });
        if (/failure|failed|unavailable/.test(event))
          this.telemetry?.record(
            event === "storage_failure" ? "storage" : "desktop",
            "failure",
          );
      })
      .catch(() => {
        /* Logging must not leak original errors or prevent recovery. */
      });
    return this.queue;
  }
}
