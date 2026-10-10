import { Snapshots } from "../../desktop/runtime/snapshots";
import { contextConnection } from "./context";
import { entitlementFor } from "../../src/lib/entitlements";
import type { MCPTool } from "../../src/types/domain";
export function contextWorkflowFixture(
  options: {
    accounts?: number;
    disabled?: boolean;
    malformed?: boolean;
    revoke?: boolean;
    folders?: string[];
  } = {},
) {
  const c = contextConnection();
  const base = c.tools[0];
  const input = (fields: string[]) => ({
    type: "object",
    properties: Object.fromEntries(
      fields.map((k) => [
        k,
        {
          type: "string",
          minLength: 1,
          title: k === "accountId" ? "Business account" : "Mail folder",
        },
      ]),
    ),
    required: fields,
    additionalProperties: false,
  });
  const output = (fields: string[]) => ({
    type: "object",
    properties: {
      records: {
        type: "array",
        items: {
          type: "object",
          properties: Object.fromEntries(
            fields.map((k) => [k, { type: "string" }]),
          ),
          required: fields,
        },
      },
    },
    required: ["records"],
  });
  const tool = (name: string, fields: string[], out: string[]): MCPTool => ({
    ...base,
    id: name,
    name,
    description: name,
    schemaHash: name,
    inputSchema: input(fields),
    outputSchema: output(out),
  });
  c.tools = [
    tool("listEmails", ["accountId", "folderId"], ["subject", "from"]),
    tool("getFolders", ["accountId"], ["folderId", "name"]),
    tool("getAccounts", [], ["accountId", "name"]),
  ];
  if (options.disabled) c.tools[2].enabled = false;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const mcp: import("../../desktop/adapters/mcp").MCPRuntime = {
    connect: async () => [],
    disconnect: async () => {},
    sources: async () => [],
    call: async (_connection, tool, args) => {
      calls.push({ name: tool.name, args });
      if (options.revoke && tool.name === "getAccounts")
        c.tools[0].enabled = false;
      const records =
        tool.name === "getAccounts"
          ? Array.from({ length: options.accounts ?? 1 }, (_, i) => ({
              accountId: `actual-account-${i}`,
              name: `Mailbox ${i}`,
            }))
          : tool.name === "getFolders"
            ? (options.folders ?? ["Inbox", "Sent"]).map((name) => ({
                folderId: `actual-${name}`,
                name,
              }))
            : Array.from({ length: 8 }, (_, i) => ({
                subject: `Email ${i}`,
                from: "Business customer",
              }));
      return JSON.stringify({
        structuredContent: options.malformed ? { status: "ok" } : { records },
      });
    },
  };
  const engine = new Snapshots(
    () => c,
    () => entitlementFor("business"),
    mcp,
    () => {},
  );

  return { c, calls, engine, mcp };
}
