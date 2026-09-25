import Ajv from "ajv";
import type {
  MCPConnection,
  MCPTool,
  Entitlement,
} from "../../src/types/domain";
import type {
  BusinessSnapshot,
  SnapshotItem,
  SnapshotKind,
} from "../../src/types/snapshot";
import type { MCPRuntime } from "../adapters/mcp";
import { connectionAvailable } from "../../src/lib/entitlements";
const semantics: [SnapshotKind, RegExp][] = [
  ["mail", /\b(emails?|messages?|inbox)\b/],
  ["inventory", /\b(stock|inventory|products?|items)\b/],
  ["crm", /\b(contacts?|leads?|deals?|customers?)\b/],
  ["orders", /\borders?\b/],
  ["accounting", /\b(invoices?|expenses?)\b/],
  ["shipping", /\b(shipments?|deliveries|tracking)\b/],
];
export interface SnapshotMapping {
  endpoint: string;
  tool: string;
  schemaHash: string;
  kind: SnapshotKind;
  arguments: Record<string, unknown>;
  evidence: string;
}
// Only release-reviewed mappings enter this registry. Names alone never establish vendor trust.
export const recommendedMappings: ReadonlyArray<SnapshotMapping> = [];
export function snapshotRead(
  c: MCPConnection,
  t: MCPTool,
  mappings: ReadonlyArray<SnapshotMapping> = recommendedMappings,
): { kind: SnapshotKind; args: Record<string, unknown> } | null {
  if (t.risk !== "read" || t.requiresApproval) return null;
  const tested = mappings.find(
    (m) =>
      m.endpoint === c.url &&
      m.tool === t.name &&
      m.schemaHash === t.schemaHash &&
      m.evidence.length > 20,
  );
  let args: Record<string, unknown> = {},
    kind: SnapshotKind | undefined = tested?.kind;
  if (tested) args = tested.arguments;
  else {
    const words = t.name
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_./-]/g, " ")
      .toLowerCase();
    if (
      !/\b(list|search|recent|retrieve|get)\b/.test(words) ||
      /\b(send|delete|update|create|refund|purchase|change|set)\b/.test(words)
    )
      return null;
    kind = semantics.find(([, pattern]) => pattern.test(words))?.[0];
    if (!kind) return null;
    const props = t.inputSchema?.properties as
      | Record<string, { type?: string; minimum?: number; maximum?: number }>
      | undefined;
    for (const [key, p] of Object.entries(props ?? {}))
      if (/^(limit|page_size|per_page)$/.test(key) && p.type === "integer")
        args[key] = Math.min(p.maximum ?? 20, Math.max(p.minimum ?? 1, 20));
  }
  try {
    if (
      !new Ajv({ strict: false }).compile(t.inputSchema ?? { type: "object" })(
        args,
      )
    )
      return null;
  } catch {
    return null;
  }
  return { kind: kind!, args };
}
function object(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function rows(raw: unknown, depth = 0): unknown[] | null {
  if (depth > 5) return null;
  if (Array.isArray(raw)) return raw;
  if (!object(raw)) return null;
  if (raw.structuredContent) return rows(raw.structuredContent, depth + 1);
  if (Array.isArray(raw.content)) {
    for (const block of raw.content) {
      if (
        object(block) &&
        block.type === "text" &&
        typeof block.text === "string"
      ) {
        try {
          const found = rows(JSON.parse(block.text), depth + 1);
          if (found) return found;
        } catch {
          /* Non-JSON server text has no assumed business shape. */
        }
      }
    }
    return null;
  }
  for (const key of [
    "data",
    "results",
    "items",
    "messages",
    "emails",
    "products",
    "contacts",
    "leads",
    "orders",
    "invoices",
    "shipments",
  ])
    if (raw[key] !== undefined) {
      const found = rows(raw[key], depth + 1);
      if (found) return found;
    }
  return null;
}
export function snapshotItems(
  raw: string,
  kind: SnapshotKind,
): SnapshotItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const list = rows(parsed);
  if (!list) return null;
  const scalar = (r: Record<string, unknown>, keys: string[]) => {
    for (const k of keys) {
      const v = r[k];
      if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      )
        return String(v).slice(0, 4000);
    }
    return "";
  };
  return list
    .slice(0, 50)
    .filter(object)
    .map((r, i) => {
      const fields: Record<string, string> = {};
      for (const [label, keys] of Object.entries({
        SKU: ["sku", "SKU", "item_code"],
        Stock: ["stock", "stock_quantity", "quantity", "available_stock"],
        Sender: ["sender", "from", "fromAddress", "email"],
        Date: ["date", "created_at", "received_at", "date_created"],
        Total: ["total", "amount", "balance"],
        Tracking: ["tracking_number", "tracking"],
        Customer: ["customer_name", "customer", "contact_name"],
        Warehouse: ["warehouse", "location"],
      })) {
        const value = scalar(r, keys);
        if (value) fields[label] = value;
      }
      return {
        id:
          scalar(r, ["id", "messageId", "item_id", "order_id", "invoice_id"]) ||
          String(i),
        title:
          scalar(r, [
            "subject",
            "name",
            "title",
            "product_name",
            "contact_name",
            "invoice_number",
            "order_number",
            "tracking_number",
          ]) || `${kind === "orders" ? "Order" : "Record"} ${i + 1}`,
        subtitle: scalar(r, [
          "sender",
          "from",
          "email",
          "sku",
          "customer_name",
          "company",
        ]),
        preview: scalar(r, [
          "preview",
          "snippet",
          "summary",
          "description",
          "body",
        ]),
        status: scalar(r, ["status", "state", "fulfillment_status"]),
        fields,
      };
    });
}
export class Snapshots {
  private cache = new Map<
    string,
    { key: string; value: BusinessSnapshot; at: number }
  >();
  private pending = new Map<string, Promise<BusinessSnapshot>>();
  constructor(
    private connection: (id: string) => MCPConnection | undefined,
    private entitlement: () => Entitlement,
    private mcp: MCPRuntime,
    private event: (
      id: string,
      action: string,
      outcome: "completed" | "failed",
    ) => void,
  ) {}
  clear() {
    this.cache.clear();
  }
  async get(id: string, refresh = false): Promise<BusinessSnapshot> {
    const c = this.connection(id);
    const base: BusinessSnapshot = {
      connectionId: id,
      kind: null,
      state: "unknown",
      items: [],
      refreshedAt: null,
      message: "Ask G-Bot about this connection, or review its permissions.",
      sourceTools: [],
    };
    if (
      !c ||
      !c.enabled ||
      !["connected", "degraded"].includes(c.status) ||
      !connectionAvailable(this.entitlement(), c)
    )
      return {
        ...base,
        state: "disconnected",
        message:
          c?.status === "authorization expired"
            ? "Authorization expired. Reconnect to refresh your business context."
            : "Reconnect this app or review your plan. Saved configuration is retained.",
      };
    const key = JSON.stringify([c.url, c.status, this.entitlement(), c.tools]);
    const prior = this.cache.get(id);
    if (!refresh && prior?.key === key && Date.now() - prior.at < 60_000)
      return prior.value;
    const pending = this.pending.get(id);
    if (pending) return pending;
    const task = (async () => {
      const possible = c.tools
        .map((t) => ({ t, map: snapshotRead(c, t) }))
        .filter((x) => x.map !== null);
      const allowed = possible.filter((x) => x.t.enabled).slice(0, 2);
      if (!allowed.length)
        return {
          ...base,
          state: possible.length ? "permission" : "unknown",
          message: possible.length
            ? "Enable an appropriate read tool in Tools & Permissions to see business context."
            : base.message,
        } as BusinessSnapshot;
      const out: BusinessSnapshot = {
        ...base,
        kind: allowed[0].map!.kind,
        state: "ready",
        message: "",
        refreshedAt: new Date().toISOString(),
      };
      let failures = 0,
        understood = 0;
      for (const { t, map } of allowed.filter(
        (x) => x.map!.kind === out.kind,
      )) {
        try {
          const current = this.connection(id),
            currentTool = current?.tools.find((x) => x.id === t.id);
          if (
            !current ||
            !current.enabled ||
            current.status !== "connected" ||
            !connectionAvailable(this.entitlement(), current) ||
            !currentTool?.enabled ||
            currentTool.schemaHash !== t.schemaHash ||
            !snapshotRead(current, currentTool)
          )
            throw Error();
          const raw = await this.mcp.call(
            current,
            currentTool,
            map!.args,
            AbortSignal.timeout(20_000),
          );
          // Permissions may change while a read is in flight: never display revoked results.
          const after = this.connection(id),
            afterTool = after?.tools.find((candidate) => candidate.id === t.id);
          if (
            !after ||
            !after.enabled ||
            after.url !== current.url ||
            !afterTool?.enabled ||
            afterTool.schemaHash !== t.schemaHash ||
            afterTool.risk !== "read" ||
            afterTool.requiresApproval ||
            !connectionAvailable(this.entitlement(), after)
          )
            throw Error();
          const items = snapshotItems(raw, map!.kind);
          if (items === null) {
            failures++;
            continue;
          }
          understood++;
          out.items.push(...items);
          out.sourceTools.push(t.label);
          this.event(id, "Business snapshot refreshed", "completed");
        } catch {
          failures++;
          this.event(id, "Business snapshot unavailable", "failed");
        }
      }
      out.items = out.items.filter(
        (item, index, all) =>
          all.findIndex((x) => x.id === item.id && x.title === item.title) ===
          index,
      );
      out.state = failures
        ? understood
          ? "partial"
          : "error"
        : out.items.length
          ? "ready"
          : "empty";
      out.message = failures
        ? "Some context could not be loaded. Retry or ask G-Bot for a more specific view."
        : out.items.length
          ? ""
          : "No recent records were returned.";
      this.cache.set(id, { key, value: out, at: Date.now() });
      return out;
    })();
    this.pending.set(id, task);
    try {
      return await task;
    } finally {
      this.pending.delete(id);
    }
  }
}
