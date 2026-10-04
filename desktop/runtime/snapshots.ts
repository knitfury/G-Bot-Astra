import { declaredRead, mutationVeto, readReason } from "./read-policy";
import { UriTemplate } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import { DomainError } from "./errors";
import { z } from "zod";
import {
  snapshotKinds,
  type SnapshotConfig,
  type SnapshotSource,
} from "../../src/types/snapshot";
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
  ["calendar", /\b(events?|meetings?|calendar)\b/],
  ["mail", /\b(emails?|messages?|inbox)\b/],
  ["inventory", /\b(stock|inventory|products?|items)\b/],
  ["crm", /\b(contacts?|leads?|deals?|customers?)\b/],
  ["orders", /\borders?\b/],
  ["accounting", /\b(invoices?|expenses?)\b/],
  ["shipping", /\b(shipments?|deliveries|tracking)\b/],
];
const path = z
  .string()
  .max(500)
  .refine(
    (v) =>
      !v
        .split(".")
        .some((k) => ["__proto__", "constructor", "prototype"].includes(k)),
  );
export const configSchema = z
  .object({
    endpoint: z.string().max(4000),
    source: z.enum(["tool", "resource"]),
    name: z.string().min(1).max(4000),
    binding: z.string().min(1).max(128),
    kind: z.enum(snapshotKinds),
    arguments: z
      .record(z.string(), z.unknown())
      .refine((v) => JSON.stringify(v).length <= 16000),
    fields: z
      .object({
        rows: path.optional(),
        title: path.optional(),
        subtitle: path.optional(),
        preview: path.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
function at(value: unknown, path: string) {
  for (const key of path.split(".").filter(Boolean)) {
    if (
      !object(value) ||
      !Object.hasOwn(value, key) ||
      ["__proto__", "constructor", "prototype"].includes(key)
    )
      return undefined;
    value = value[key];
  }
  return value;
}
export interface SnapshotMapping {
  endpoint: string;
  tool: string;
  schemaHash: string;
  kind: SnapshotKind;
  arguments: Record<string, unknown>;
  evidence: string;
  label?: string;
  fields?: SnapshotConfig["fields"];
}
// Only release-reviewed mappings enter this registry. Names alone never establish vendor trust.
export const recommendedMappings: ReadonlyArray<SnapshotMapping> = [];
export function snapshotRead(
  c: MCPConnection,
  t: MCPTool,
  mappings: ReadonlyArray<SnapshotMapping> = recommendedMappings,
): { kind: SnapshotKind; args: Record<string, unknown> } | null {
  if (mutationVeto(t)) return null;
  const tested = mappings.find(
    (m) =>
      m.endpoint === c.url &&
      m.tool === t.name &&
      m.schemaHash === t.schemaHash &&
      m.evidence.length > 20,
  );
  if (!declaredRead(t) && !tested) return null;
  if (c.snapshotConfig) {
    const config = configSchema.safeParse(c.snapshotConfig);
    if (
      !config.success ||
      config.data.endpoint !== c.url ||
      config.data.source !== "tool" ||
      config.data.name !== t.name ||
      config.data.binding !== t.schemaHash ||
      (!declaredRead(t) &&
        JSON.stringify(config.data.arguments) !==
          JSON.stringify(tested?.arguments))
    )
      return null;
    try {
      return new Ajv({ strict: false }).validate(
        t.inputSchema ?? { type: "object" },
        config.data.arguments,
      )
        ? { kind: config.data.kind, args: config.data.arguments }
        : null;
    } catch {
      return null;
    }
  }
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
  if (Array.isArray(raw.contents))
    return rows(
      {
        content: raw.contents.map((v) =>
          object(v) ? { type: "text", text: v.text } : v,
        ),
      },
      depth + 1,
    );
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
    "events",
    "deals",
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
  mapping?: SnapshotConfig["fields"],
): SnapshotItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return kind === "generic"
      ? [
          {
            id: "text",
            title: "App context",
            subtitle: "",
            preview: raw.slice(0, 4000),
            status: "",
            fields: {},
          },
        ]
      : null;
  }
  let content: unknown = parsed;
  if (object(parsed) && parsed.structuredContent)
    content = parsed.structuredContent;
  else if (object(parsed)) {
    const blocks = parsed.content ?? parsed.contents;
    if (Array.isArray(blocks)) {
      const block = blocks.find((b) => object(b) && typeof b.text === "string");
      if (block) {
        try {
          content = JSON.parse(block.text);
        } catch {
          if (kind === "generic")
            content = {
              title: "Resource content",
              preview: String(block.text).slice(0, 4000),
            };
        }
      }
    }
  }
  let list = mapping?.rows ? at(content, mapping.rows) : rows(parsed);
  if (
    !Array.isArray(list) &&
    kind === "generic" &&
    object(content) &&
    !Array.isArray(content.content) &&
    !Array.isArray(content.contents)
  )
    list = [content];
  if (!Array.isArray(list)) return null;
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
        Starts: ["start", "start_time", "startDateTime"],
        Date: ["date", "created_at", "received_at", "date_created"],
        Total: ["total", "amount", "balance"],
        Tracking: ["tracking_number", "tracking"],
        Customer: ["customer_name", "customer", "contact_name"],
        Warehouse: ["warehouse", "location"],
      })) {
        const value = scalar(r, keys);
        if (value) fields[label] = value;
      }
      if (kind === "generic")
        for (const [key, value] of Object.entries(r).slice(0, 20)) {
          if (["string", "number", "boolean"].includes(typeof value))
            fields[key.slice(0, 100)] = String(value).slice(0, 4000);
        }
      const mapped = (key: "title" | "subtitle" | "preview") => {
        const value = mapping?.[key] ? at(r, mapping[key]!) : undefined;
        return ["string", "number", "boolean"].includes(typeof value)
          ? String(value).slice(0, 4000)
          : "";
      };
      return {
        id:
          scalar(r, ["id", "messageId", "item_id", "order_id", "invoice_id"]) ||
          String(i),
        title:
          mapped("title") ||
          scalar(r, [
            "subject",
            "name",
            "title",
            "product_name",
            "contact_name",
            "invoice_number",
            "order_number",
            "tracking_number",
          ]) ||
          `${kind === "orders" ? "Order" : "Record"} ${i + 1}`,
        subtitle:
          mapped("subtitle") ||
          scalar(r, [
            "sender",
            "from",
            "email",
            "sku",
            "customer_name",
            "company",
          ]),
        preview:
          mapped("preview") ||
          scalar(r, ["preview", "snippet", "summary", "description", "body"]),
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
  private generation = 0;
  private controllers = new Set<AbortController>();
  get active() {
    return this.pending.size > 0;
  }
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
    this.generation++;
    for (const controller of this.controllers) controller.abort();
    this.cache.clear();
  }
  async drain() {
    this.clear();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...this.pending.values()]),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Snapshot requests have not stopped.")),
            10_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async sources(id: string): Promise<SnapshotSource[]> {
    const c = this.connection(id);
    if (!c || !c.enabled || !connectionAvailable(this.entitlement(), c))
      throw new DomainError(
        "ENTITLEMENT",
        "Connect this app within your plan before configuring context.",
      );
    const mappings = (await this.mcp.paneMappings?.()) ?? [];
    const tools: SnapshotSource[] = c.tools.map((t) => ({
      source: "tool",
      name: t.name,
      label:
        mappings.find(
          (m) =>
            m.endpoint === c.url &&
            m.tool === t.name &&
            m.schemaHash === t.schemaHash,
        )?.label ?? t.label,
      binding: t.schemaHash ?? "",
      eligible:
        t.enabled &&
        !mutationVeto(t) &&
        (declaredRead(t) ||
          mappings.some(
            (m) =>
              m.endpoint === c.url &&
              m.tool === t.name &&
              m.schemaHash === t.schemaHash &&
              m.evidence.length > 20,
          )) &&
        !!t.schemaHash,
      reason: mutationVeto(t) ? readReason(t) : !t.enabled
        ? "Enable this tool in Tools & Permissions first."
        : !declaredRead(t) && !snapshotRead(c, t, mappings)
          ? readReason(t)
          : snapshotRead(c, t, mappings)
            ? "Automatic read available. Review this server’s trust and tool permissions."
            : "Select this read source and supply any required parameters.",
      authority: declaredRead(t)
        ? "server-declared"
        : mappings.some(
              (m) =>
                m.endpoint === c.url &&
                m.tool === t.name &&
                m.schemaHash === t.schemaHash,
            )
          ? "signed-catalog"
          : undefined,
      defaults: mappings.find(
        (m) =>
          m.endpoint === c.url &&
          m.tool === t.name &&
          m.schemaHash === t.schemaHash,
      ),
      inputSchema: t.inputSchema,
    }));
    try {
      return [
        ...tools,
        ...(await (this.mcp.sources?.(c) ?? Promise.resolve([]))),
      ];
    } catch {
      return [
        ...tools,
        {
          source: "resource",
          name: "unavailable",
          label: "Resource discovery",
          binding: "",
          eligible: false,
          reason:
            "Resource discovery failed. Reconnect and try again; tool sources remain available.",
        },
      ];
    }
  }
  async configure(id: string, input: SnapshotConfig | null) {
    const c = this.connection(id);
    if (!c) throw new DomainError("INVALID_ARGUMENTS", "Connection not found.");
    if (input === null) {
      delete c.snapshotConfig;
      this.clear();
      return;
    }
    const config = configSchema.parse(input);
    const source = (await this.sources(id)).find(
      (s) =>
        s.source === config.source &&
        s.name === config.name &&
        s.binding === config.binding &&
        s.eligible,
    );
    if (!source || config.endpoint !== c.url)
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "Source changed or permission is missing. Discover sources again.",
      );
    if (
      source.source === "tool" &&
      !new Ajv({ strict: false }).validate(
        source.inputSchema ?? { type: "object" },
        config.arguments,
      )
    )
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "Parameters do not match the read tool schema. Supply the required fields.",
      );
    if (
      source.source === "resource" &&
      Object.values(config.arguments).some((v) => typeof v !== "string")
    )
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "Resource template parameters must be text.",
      );
    if (
      source.template &&
      new UriTemplate(source.name).variableNames.some(
        (key) =>
          typeof config.arguments[key] !== "string" || !config.arguments[key],
      )
    )
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "Supply every resource template parameter before saving.",
      );
    if (source.source === "tool") {
      const tool = c.tools.find((t) => t.name === config.name);
      if (
        !tool ||
        !snapshotRead(
          { ...c, snapshotConfig: config },
          tool,
          (await this.mcp.paneMappings?.()) ?? [],
        )
      )
        throw new DomainError(
          "INVALID_ARGUMENTS",
          "The selected arguments are not authorized by this read source. Catalog-only sources require the reviewed argument set.",
        );
    }
    c.snapshotConfig = config;
    this.clear();
  }
  async get(id: string, refresh = false): Promise<BusinessSnapshot> {
    const c = this.connection(id);
    const base: BusinessSnapshot = {
      connectionId: id,
      kind: null,
      state: "unknown",
      items: [],
      refreshedAt: null,
      message:
        "No compatible automatic read was found. Configure a read-only pane source; required parameters or unsupported tool metadata may need attention. AI is optional.",
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
    const mappings = (await this.mcp.paneMappings?.()) ?? [];
    const keyFor = () =>
      JSON.stringify([
        this.connection(id),
        this.entitlement(),
        this.generation,
        mappings,
      ]);
    const key = keyFor();
    const prior = this.cache.get(id);
    if (!refresh && prior?.key === key && Date.now() - prior.at < 60_000)
      return prior.value;
    const pending = this.pending.get(id);
    if (pending) return pending;
    const controller = new AbortController();
    this.controllers.add(controller);
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(20_000),
    ]);
    const task = (async () => {
      if (c.snapshotConfig?.source === "resource") {
        try {
          const config = configSchema.parse(c.snapshotConfig);
          const source = (await this.sources(id)).find(
            (s) =>
              s.source === "resource" &&
              s.name === config.name &&
              s.binding === config.binding,
          );
          if (
            !source?.eligible ||
            config.endpoint !== c.url ||
            !this.mcp.readResource ||
            key !== keyFor()
          )
            throw Error();
          const raw = await this.mcp.readResource(
            c,
            source,
            config.arguments,
            signal,
          );
          if (signal.aborted || key !== keyFor()) throw Error();
          const items = snapshotItems(raw, config.kind, config.fields);
          if (items === null)
            return {
              ...base,
              state: "unknown" as const,
              message:
                "The resource was read but its content needs a field mapping or a supported structured format.",
            };
          this.event(id, "Business snapshot refreshed", "completed");
          return {
            ...base,
            kind: config.kind,
            state: items.length ? ("ready" as const) : ("empty" as const),
            items,
            refreshedAt: new Date().toISOString(),
            sourceTools: [source.label],
            message: items.length ? "" : "No recent records were returned.",
          };
        } catch {
          this.event(id, "Business snapshot unavailable", "failed");
          return {
            ...base,
            state: "error" as const,
            message:
              "Resource unavailable or permission changed. Reconnect, review the pane source and retry.",
          };
        }
      }
      const possible = c.tools
        .map((t) => ({ t, map: snapshotRead(c, t, mappings) }))
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
            JSON.stringify(
              snapshotRead(
                current,
                currentTool,
                (await this.mcp.paneMappings?.()) ?? [],
              ),
            ) !== JSON.stringify(map)
          )
            throw Error();
          const raw = await this.mcp.call(
            current,
            currentTool,
            map!.args,
            signal,
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
            JSON.stringify(
              snapshotRead(
                after,
                afterTool,
                (await this.mcp.paneMappings?.()) ?? [],
              ),
            ) !== JSON.stringify(map) ||
            !connectionAvailable(this.entitlement(), after)
          )
            throw Error();
          if (signal.aborted || key !== keyFor()) throw Error();
          if (
            currentTool.outputSchema &&
            !new Ajv({ strict: false }).validate(
              currentTool.outputSchema,
              JSON.parse(raw).structuredContent,
            )
          )
            throw Error();
          const items = snapshotItems(
            raw,
            map!.kind,
            c.snapshotConfig?.fields ??
              mappings.find(
                (m) =>
                  m.endpoint === c.url &&
                  m.tool === t.name &&
                  m.schemaHash === t.schemaHash,
              )?.fields,
          );
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
      if (key === keyFor() && !signal.aborted)
        this.cache.set(id, { key, value: out, at: Date.now() });
      return out;
    })();
    this.pending.set(id, task);
    try {
      const result = await task;
      return key === keyFor() && !signal.aborted
        ? result
        : {
            ...base,
            state: "permission",
            message:
              "Context changed while loading. Refresh after reviewing permissions.",
          };
    } finally {
      this.pending.delete(id);
      this.controllers.delete(controller);
    }
  }
}
