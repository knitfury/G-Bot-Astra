import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { createHash } from "node:crypto";
import type { MCPConnection, MCPTool } from "../../src/types/domain";
import { SecretVault } from "../runtime/storage";
import { remoteURL } from "../runtime/security";
import { DomainError } from "../runtime/errors";
import { DesktopOAuth } from "./oauth";
export interface MCPRuntime {
  connect(connection: MCPConnection): Promise<MCPTool[]>;
  call(
    connection: MCPConnection,
    tool: MCPTool,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<string>;
  disconnect(id: string): Promise<void>;
}
export class RemoteMCP implements MCPRuntime {
  private clients = new Map<string, Client>();
  private oauth = new Map<string, DesktopOAuth>();
  constructor(
    private vault: SecretVault,
    private launch: (url: string) => Promise<void>,
    private event: (id: string, event: string) => void = () => {},
  ) {}
  async connect(c: MCPConnection): Promise<MCPTool[]> {
    await this.disconnect(c.id);
    const endpoint = remoteURL(c.url);
    const saved = await this.vault.get(`${c.id}:manual`);
    const headers = saved ? (JSON.parse(saved) as Record<string, string>) : {};
    const provider =
      c.auth === "OAuth"
        ? new DesktopOAuth(
            c.id,
            this.vault,
            this.launch,
            c.oauthClientId,
            (e) => this.event(c.id, e),
          )
        : undefined;
    if (provider) this.oauth.set(c.id, provider);
    const transport = new StreamableHTTPClientTransport(endpoint, {
      authProvider: provider,
      requestInit: { headers, redirect: "error" },
      fetch: async (input, init) => {
        const u = new URL(String(input));
        if (
          u.protocol !== "https:" &&
          !(
            u.protocol === "http:" &&
            ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
          )
        )
          throw new DomainError(
            "MCP_PROTOCOL",
            "MCP authorization requires HTTPS.",
          );
        return fetch(input, {
          ...init,
          redirect: "error",
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(30_000),
          ]),
        });
      },
    });
    let client = new Client(
      { name: "G-Bot", version: "0.2.0" },
      { capabilities: {} },
    );
    try {
      try {
        await client.connect(transport);
      } catch (e) {
        if (!(e instanceof UnauthorizedError) || !provider) throw e;
        this.event(c.id, "Waiting for browser authorization");
        const code = await provider.code();
        await transport.finishAuth(code);
        client = new Client(
          { name: "G-Bot", version: "0.2.0" },
          { capabilities: {} },
        );
        await client.connect(transport);
      }
      const discovered: MCPTool[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const result = await client.listTools(cursor ? { cursor } : undefined);
        for (const t of result.tools) {
          const schema = t.inputSchema as Record<string, unknown>;
          const schemaHash = createHash("sha256")
            .update(
              JSON.stringify({
                schema,
                annotations: t.annotations,
                description: t.description,
              }),
            )
            .digest("hex");
          const old = c.tools.find(
            (x) => x.name === t.name && x.schemaHash === schemaHash,
          );
          const read =
            t.annotations?.readOnlyHint === true &&
            t.annotations?.destructiveHint !== true;
          discovered.push({
            id: `${c.id}:${t.name}`,
            connectionId: c.id,
            name: t.name,
            label: t.title || t.name,
            description: (t.description || "No description supplied.").slice(
              0,
              4000,
            ),
            risk: read
              ? "read"
              : t.annotations?.destructiveHint
                ? "destructive"
                : "write",
            requiresApproval: !read,
            enabled: old?.enabled ?? false,
            inputSchema: schema,
            schemaHash,
          });
        }
        cursor = result.nextCursor;
        if (++pages > 20 || discovered.length > 500)
          throw new DomainError(
            "MCP_PROTOCOL",
            "Server discovery exceeded the supported limit.",
          );
      } while (cursor);
      this.clients.set(c.id, client);
      return discovered;
    } catch (e) {
      await client.close().catch(() => {});
      if (e instanceof DomainError) throw e;
      throw new DomainError(
        e instanceof UnauthorizedError ? "MCP_AUTH" : "MCP_UNAVAILABLE",
        e instanceof UnauthorizedError
          ? "MCP authentication required. Replace credentials or reconnect."
          : "Could not connect to the remote MCP server. Check its URL and Streamable HTTP support.",
      );
    } finally {
      provider?.close();
    }
  }
  async call(
    c: MCPConnection,
    t: MCPTool,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<string> {
    const client = this.clients.get(c.id);
    if (!client)
      throw new DomainError(
        "MCP_UNAVAILABLE",
        "Reconnect this server before using its tools.",
      );
    try {
      const result = await client.callTool(
        { name: t.name, arguments: args },
        undefined,
        { signal, timeout: 60_000 },
      );
      if (result.isError)
        throw new DomainError(
          "TOOL_FAILED",
          "The tool reported a failure. Review the server and retry reads; check external state before repeating changes.",
        );
      const text = JSON.stringify(result);
      if (text.length > 200_000)
        throw new DomainError(
          "TOOL_FAILED",
          "Tool result is too large. Ask for a narrower query.",
        );
      return text;
    } catch (e) {
      if (e instanceof DomainError) throw e;
      if (signal.aborted)
        throw new DomainError(
          "CANCELLED",
          "Tool request stopped. An external action may already have completed.",
        );
      if (e instanceof UnauthorizedError) {
        this.event(c.id, "Authorization expired");
        throw new DomainError(
          "MCP_EXPIRED",
          "Authorization expired. Reconnect this server.",
        );
      }
      throw new DomainError(
        "TOOL_FAILED",
        "Tool request failed. Reconnect and retry read operations; verify external state before repeating changes.",
      );
    }
  }
  async disconnect(id: string) {
    this.oauth.get(id)?.close();
    this.oauth.delete(id);
    const client = this.clients.get(id);
    this.clients.delete(id);
    if (client) await client.close();
  }
}
