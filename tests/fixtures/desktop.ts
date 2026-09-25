// Deterministic test-only adapters. This module is never imported by the desktop main process.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Runtime,
  localDatabase,
  databaseShape,
} from "../../desktop/runtime/service";
import {
  AtomicStore,
  SecretVault,
  stringMap,
} from "../../desktop/runtime/storage";
import { DomainError } from "../../desktop/runtime/errors";
import type { Inference } from "../../desktop/adapters/providers";
import type { MCPRuntime } from "../../desktop/adapters/mcp";
export async function fixtureRuntime(
  identity?: import("../../desktop/runtime/identity").ProductionIdentity,
) {
  const dir = await mkdtemp(join(tmpdir(), "gbot-acceptance-"));
  const vault = new SecretVault(
    new AtomicStore(dir, "secrets", () => ({}), stringMap),
    {
      available: async () => true,
      encrypt: async (v) => Buffer.from(`fixture:${v}`),
      decrypt: async (v) => v.toString().slice(8),
    },
  );
  let writes = 0,
    reads = 0,
    fail = false;
  const mcp: MCPRuntime = {
    connect: async (c) => {
      if (c.auth === "Token" && !(await vault.get(c.id + ":manual")))
        throw new DomainError("MCP_AUTH", "Enter a token to reconnect.");
      return [false, true].map((write) => ({
        id: `${c.id}:${write ? "send" : "read"}`,
        connectionId: c.id,
        name: write ? "send" : "read",
        label: write ? "Send response" : "Read context",
        description: write
          ? "Send the proposed customer response"
          : "Retrieve business context",
        enabled:
          c.tools.find((t) => t.name === (write ? "send" : "read"))?.enabled ??
          false,
        risk: write ? "write" : "read",
        requiresApproval: write,
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        schemaHash: "fixture-v1",
      }));
    },
    disconnect: async () => {},
    call: async (c, t) => {
      if (t.requiresApproval) {
        writes++;
        return "Sent successfully";
      }
      if (fail && c.category === "Inventory") {
        fail = false;
        c.status = "authorization expired";
        c.enabled = false;
        throw new DomainError(
          "MCP_EXPIRED",
          "Authorization expired. Reconnect Inventory and retry.",
        );
      }
      reads++;
      return c.category === "Inventory"
        ? "ARC: 24 units available"
        : "Customer requests 12 ARC lamps";
    },
  };
  const inference: Inference = {
    generate: async (_p, turns, tools, _signal, delta) => {
      if (turns[0].text === "Reply with OK.") return { text: "OK", calls: [] };
      const query = turns.filter((t) => t.role === "user").at(-1)?.text ?? "";
      const completed = turns.filter((t) => t.role === "tool");
      const wantWrite = /send/i.test(query);
      const ordered = [
        tools.find(
          (t) =>
            t.description.includes("Email") &&
            t.description.includes("Retrieve"),
        ),
        tools.find(
          (t) =>
            t.description.includes("Inventory") &&
            t.description.includes("Retrieve"),
        ),
        ...(wantWrite
          ? [
              tools.find(
                (t) =>
                  t.description.includes("Email") &&
                  t.description.includes("Send"),
              ),
            ]
          : []),
      ].filter((t) => !!t);
      if (completed.length < ordered.length) {
        return {
          text: "",
          calls: [
            {
              id: `fixture-${completed.length}`,
              name: ordered[completed.length]!.name,
              arguments: {
                query:
                  completed.length === 2
                    ? "Send customer response about 12 ARC lamps"
                    : "ARC lamps",
              },
            },
          ],
        };
      }
      const text = completed.some((t) => t.text.includes("rejected"))
        ? "You rejected the action. No response was sent."
        : wantWrite
          ? "Response sent after your approval."
          : "The customer needs 12 lamps; 24 are available.";
      delta(text);
      return { text, calls: [] };
    },
  };
  const runtime = new Runtime(
    new AtomicStore(dir, "state", localDatabase, databaseShape),
    vault,
    inference,
    mcp,
    {
      check: async () => {
        runtime.db.updateStatus = "up to date";
        await runtime.save();
      },
      download: async () => {},
    },
    identity,
  );
  await runtime.init();
  return {
    runtime,
    writes: () => writes,
    reads: () => reads,
    expire: () => {
      fail = true;
    },
  };
}
