import { argumentPlan, rankSource } from "./context-discovery";
import { inferKind, normalizeContext } from "../../src/lib/context-inference";
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
  if (!t.schemaHash || mutationVeto(t)) return null;
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
  const plan = argumentPlan(t.inputSchema, tested?.arguments);
  if (!plan.valid) return null;
  return {
    kind:
      tested?.kind ??
      inferKind(`${t.label} ${t.name} ${t.description}`, t.outputSchema),
    args: plan.args,
  };
}

export function snapshotItems(
  raw: string,
  kind: SnapshotKind,
  mapping?: SnapshotConfig["fields"],
): SnapshotItem[] | null {
  try {
    return normalizeContext(raw, kind, mapping).items;
  } catch {
    return null;
  }
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
  async sources(
    id: string,
    signal = AbortSignal.timeout(20_000),
  ): Promise<SnapshotSource[]> {
    const c = this.connection(id);
    if (!c || !c.enabled || !connectionAvailable(this.entitlement(), c))
      throw new DomainError(
        "ENTITLEMENT",
        "Connect this app within your plan before configuring context.",
      );
    const mappings = (await this.mcp.paneMappings?.()) ?? [];
    const tools: SnapshotSource[] = c.tools.map((t) => ({
      source: "tool",
      description: t.description,
      outputSchema: t.outputSchema,
      safety: !t.enabled ? "permission" : undefined,
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
      reason: mutationVeto(t)
        ? readReason(t)
        : !t.enabled
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
        ...(await (this.mcp.sources?.(c, signal) ?? Promise.resolve([]))),
      ]
        .map((source) => rankSource(source, c.snapshotConfig))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } catch {
      return [
        ...tools.map((source) => rankSource(source, c.snapshotConfig)),
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
  async get(
    id: string,
    refresh = false,
    selection?: string,
  ): Promise<BusinessSnapshot> {
    const c = this.connection(id);
    const base: BusinessSnapshot = {
      connectionId: id,
      kind: null,
      state: "unknown",
      items: [],
      refreshedAt: null,
      message:
        "No safely readable context is available. Review this server’s resources and tool permissions.",
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
          "Reconnect this app or review its permissions. Saved configuration is retained.",
      };
    const keyFor = () =>
      JSON.stringify([
        this.connection(id),
        this.entitlement(),
        this.generation,
        selection,
      ]);
    const key = keyFor();
    const existing = this.pending.get(id);
    if (existing) {
      await existing;
      return this.get(id, refresh, selection);
    }
    const controller = new AbortController();
    this.controllers.add(controller);
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(20_000),
    ]);
    const task = (async (): Promise<BusinessSnapshot> => {
      const sources = await this.sources(id, signal);
      const sourceKey = (s: SnapshotSource) => `${s.source}:${s.name}`;
      const view = { ...base, sources };
      if (key !== keyFor() || signal.aborted)
        return {
          ...view,
          state: "permission",
          message: "Context changed. Refresh after reviewing permissions.",
        };
      const configured = c.snapshotConfig;
      const chosen =
        selection ??
        (configured ? `${configured.source}:${configured.name}` : undefined);
      const safe = sources.filter(
        (s) => s.eligible && (!chosen || sourceKey(s) === chosen),
      );
      const ready = safe.filter(
        (s) =>
          argumentPlan(s.inputSchema, s.arguments).valid && !s.needs?.length,
      );
      if (
        configured &&
        !selection &&
        (!safe.length ||
          safe[0].binding !== configured.binding ||
          c.url !== configured.endpoint)
      )
        return {
          ...view,
          state: sources.some(
            (s) => s.name === configured.name && s.safety === "permission",
          )
            ? "permission"
            : "configuration",
          message:
            "Saved source changed or its permission was removed. Review its source and parameters.",
        };
      if (!ready.length) {
        if (safe.length)
          return {
            ...view,
            state: "configuration",
            selectedSource: sourceKey(safe[0]),
            kind: safe[0].kind ?? "generic",
            message: safe[0].needs?.length
              ? `This source needs ${safe[0].needs.join(", ")}. Choose values in Configure pane.`
              : "This source needs valid parameters. Configure pane to continue.",
          };
        return {
          ...view,
          state: sources.some((s) => s.safety === "permission")
            ? "permission"
            : "unknown",
          message: sources.some((s) => s.safety === "permission")
            ? "Enable a verified read tool in Tools & Permissions to load context."
            : base.message,
        };
      }
      // Re-discovery above also revalidates catalog/resource grants before cached data is used.
      const authorityKey = JSON.stringify(sources);
      const cacheKey = key + authorityKey;
      const prior = this.cache.get(id);
      if (!refresh && prior?.key === cacheKey && Date.now() - prior.at < 60_000)
        return prior.value;
      let failures = 0;
      for (const source of ready.slice(0, chosen ? 1 : 3)) {
        try {
          const current = this.connection(id);
          if (
            !current ||
            key !== keyFor() ||
            signal.aborted ||
            !connectionAvailable(this.entitlement(), current)
          )
            throw Error();
          const config =
            configured?.source === source.source &&
            configured.name === source.name
              ? configured
              : undefined;
          let raw: string;
          if (source.source === "resource") {
            if (!this.mcp.readResource) throw Error();
            raw = await this.mcp.readResource(
              current,
              source,
              source.arguments ?? {},
              signal,
            );
          } else {
            const t = current.tools.find(
              (t) =>
                t.name === source.name &&
                t.schemaHash === source.binding &&
                t.connectionId === id,
            );
            if (!t?.enabled) throw Error();
            const policy = snapshotRead(
              { ...current, snapshotConfig: config },
              t,
              (await this.mcp.paneMappings?.()) ?? [],
            );
            if (
              !policy ||
              JSON.stringify(policy.args) !== JSON.stringify(source.arguments)
            )
              throw Error();
            raw = await this.mcp.call(current, t, policy.args, signal);
            if (
              t.outputSchema &&
              !new Ajv({ strict: false, validateFormats: false }).validate(
                t.outputSchema,
                JSON.parse(raw).structuredContent,
              )
            )
              throw Error();
          }
          if (raw.length > 200_000 || signal.aborted || key !== keyFor())
            throw Error();
          const after = (await this.sources(id, signal)).find(
            (s) => sourceKey(s) === sourceKey(source),
          );
          if (
            !after?.eligible ||
            after.binding !== source.binding ||
            JSON.stringify(after.arguments) !==
              JSON.stringify(source.arguments) ||
            key !== keyFor() ||
            signal.aborted
          )
            throw Error();
          const normalized = normalizeContext(
            raw,
            source.kind ?? "generic",
            config?.fields ?? source.defaults?.fields,
            source.outputSchema,
          );
          const out: BusinessSnapshot = {
            ...view,
            ...normalized,
            state: failures
              ? "partial"
              : normalized.items.length
                ? "ready"
                : "empty",
            selectedSource: sourceKey(source),
            refreshedAt: new Date().toISOString(),
            sourceTools: [source.label],
            message: failures
              ? "The preferred source was unavailable. Showing another safe context."
              : normalized.truncated
                ? "Showing a bounded overview. Refine the source parameters for a narrower view."
                : normalized.items.length
                  ? ""
                  : "No records were returned.",
          };
          this.event(id, "Business context refreshed", "completed");
          this.cache.set(id, { key: cacheKey, value: out, at: Date.now() });
          return out;
        } catch {
          failures++;
          this.event(id, "Business context unavailable", "failed");
        }
      }
      return {
        ...view,
        state: "error",
        selectedSource: chosen,
        message:
          "Context could not be loaded. Refresh or review the selected source and parameters.",
      };
    })();
    this.pending.set(id, task);
    try {
      return await task;
    } finally {
      this.pending.delete(id);
      this.controllers.delete(controller);
    }
  }
}
