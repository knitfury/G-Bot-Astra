import {
  choiceRecordPath,
  parameterFields,
  validateParameters,
} from "../../src/lib/context-parameters";
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
      safety:
        !t.enabled &&
        !!t.schemaHash &&
        !mutationVeto(t) &&
        (declaredRead(t) ||
          mappings.some(
            (m) =>
              m.endpoint === c.url &&
              m.tool === t.name &&
              m.schemaHash === t.schemaHash &&
              m.evidence.length > 20,
          ))
          ? "permission"
          : undefined,
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
  async choices(
    id: string,
    targetKey: string,
    fieldPath: string,
    discoveryKey: string,
    consent: boolean,
  ): Promise<import("../../src/types/snapshot").ParameterChoices> {
    if (!consent)
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "Trust this server before looking up available values.",
      );
    const sourceKey = (s: SnapshotSource) => `${s.source}:${s.name}`;
    const endpoint = this.connection(id)?.url;
    const sources = await this.sources(id);
    const target = sources.find(
      (s) => sourceKey(s) === targetKey && s.eligible,
    );
    const discovery = sources.find(
      (s) =>
        sourceKey(s) === discoveryKey && s.eligible && s.readiness === "ready",
    );
    const field =
      target &&
      parameterFields(target.inputSchema).find(
        (f) => f.path === fieldPath && !f.complex,
      );
    const recordPath =
      field && discovery && choiceRecordPath(discovery.outputSchema, field);
    if (
      !target ||
      !discovery ||
      !field ||
      !recordPath ||
      targetKey === discoveryKey
    )
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "No ready verified discovery source declares matching values for this field. Enter a value from your business app.",
      );
    const result = await this.get(id, true, discoveryKey);
    const current = await this.sources(id);
    if (
      this.connection(id)?.url !== endpoint ||
      ![target, discovery].every((s) =>
        current.some(
          (n) =>
            sourceKey(n) === sourceKey(s) &&
            n.eligible &&
            n.binding === s.binding,
        ),
      )
    )
      throw new DomainError(
        "TOOL_UNAVAILABLE",
        "Discovery permissions changed. Review access and try again.",
      );
    const choices: import("../../src/types/snapshot").ParameterChoices["choices"] =
      [];
    for (const item of result.items.slice(0, 50)) {
      const text = item.values?.[recordPath];
      if (text === undefined) continue;
      const value =
        field.schema.type === "string"
          ? text
          : field.schema.type === "boolean"
            ? text === "true"
              ? true
              : text === "false"
                ? false
                : undefined
            : Number(text);
      if (
        value === undefined ||
        !validateParameters(field.schema, value).valid ||
        choices.some((c) => c.value === value)
      )
        continue;
      choices.push({
        value,
        label: `${item.title.slice(0, 120)} · ${String(value).slice(0, 120)}`,
      });
    }
    return {
      choices,
      message: choices.length
        ? "Choose a value to use; no source settings have been changed."
        : result.message ||
          "No matching values returned. Enter a value from your business app.",
    };
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
    const validation = validateParameters(source.inputSchema, config.arguments);
    if (!validation.valid)
      throw new DomainError(
        "INVALID_ARGUMENTS",
        validation.issues.map((i) => i.message).join(" "),
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
      const diagnostics: NonNullable<BusinessSnapshot["diagnostics"]> = {
        format: "gbot-context-outcomes-v1",
        mode: selection || c.snapshotConfig ? "selected" : "automatic",
        ready: sources.filter((s) => s.eligible && s.readiness === "ready")
          .length,
        configuration: sources.filter(
          (s) => s.eligible && s.readiness === "configuration",
        ).length,
        disabled: sources.filter((s) => s.safety === "permission").length,
        blocked: sources.filter((s) => !s.eligible && s.safety !== "permission")
          .length,
        attempts: [],
        exhausted: false,
      };
      const view = { ...base, sources, diagnostics };
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
            message: `This source needs ${safe[0].needs?.map((path) => parameterFields(safe[0].inputSchema).find((f) => f.path === path)?.label ?? path).join(", ") || "valid values"}. Choose values in Configure pane. Enabled tools still need valid source settings before records can be read.`,
          };
        return {
          ...view,
          state: sources.some(
            (s) =>
              s.safety === "permission" && (!chosen || sourceKey(s) === chosen),
          )
            ? "permission"
            : "unknown",
          message: sources.some(
            (s) =>
              s.safety === "permission" && (!chosen || sourceKey(s) === chosen),
          )
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
      let metadataResponses = 0;
      let lastEmpty: BusinessSnapshot | undefined;
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
              throw new DomainError(
                "MCP_PROTOCOL",
                "The response did not match the declared schema.",
              );
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
          if (normalized.metadataOnly) {
            metadataResponses++;
            diagnostics.attempts.push({
              source: sources.indexOf(source),
              outcome: "status-only",
              records: 0,
            });
            continue;
          }
          diagnostics.attempts.push({
            source: sources.indexOf(source),
            outcome: normalized.items.length ? "records" : "empty",
            records: normalized.items.length,
          });
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
                  : `${source.label} returned an empty result. Check this source’s account, folder and filters in Configure pane, or choose another source.`,
          };
          if (!normalized.items.length && !chosen) {
            lastEmpty = out;
            continue;
          }
          this.event(id, "Business context refreshed", "completed");
          this.cache.set(id, { key: cacheKey, value: out, at: Date.now() });
          return out;
        } catch (error) {
          failures++;
          const code =
            error instanceof DomainError ? error.code : "TOOL_FAILED";
          diagnostics.attempts.push({
            source: sources.indexOf(source),
            outcome:
              key !== keyFor() || signal.aborted
                ? "changed"
                : code === "INVALID_ARGUMENTS"
                  ? "invalid-arguments"
                  : "tool-error",
            records: 0,
            code,
          });
          this.event(id, "Business context unavailable", "failed");
        }
      }
      if (key !== keyFor() || signal.aborted)
        return {
          ...view,
          state: "permission",
          message:
            "Access or source settings changed during the read. Refresh after reviewing permissions.",
        };
      diagnostics.exhausted =
        !chosen && ready.length > diagnostics.attempts.length;
      if (lastEmpty && !failures && !metadataResponses) {
        const out = {
          ...lastEmpty,
          message: `The ${diagnostics.attempts.length} checked sources returned empty results.${diagnostics.exhausted ? " The automatic read limit was reached; other ready sources were not checked." : ""}${diagnostics.configuration ? " Some sources still need account or filter settings. Open Configure pane to choose values." : " Choose another source or check its filters."}`,
        };
        this.cache.set(id, { key: cacheKey, value: out, at: Date.now() });
        return out;
      }
      if (metadataResponses && !failures && !lastEmpty)
        return {
          ...view,
          state: "configuration",
          selectedSource: chosen,
          message: `The source returned only API status information, not business records. Choose a record source in Context or Configure pane and supply its required parameters.${diagnostics.exhausted ? " Automatic fallback reached its read limit; other ready sources were not checked." : ""}`,
        };
      const errorCodes = diagnostics.attempts.map((a) => a.code);
      const recovery = errorCodes.some(
        (c) => c === "MCP_AUTH" || c === "MCP_EXPIRED",
      )
        ? " Reconnect this business app to renew its authorization."
        : errorCodes.includes("TIMEOUT")
          ? " The server did not respond in time. Try Refresh."
          : errorCodes.includes("MCP_PROTOCOL")
            ? " The response did not match the server’s declared schema. Share sanitized diagnostics with its administrator."
            : "";
      return {
        ...view,
        state: "error",
        selectedSource: chosen,
        message: `Business records could not be loaded: ${diagnostics.attempts.filter((a) => a.outcome === "empty").length} empty results, ${metadataResponses} status-only responses, ${failures} failed reads.${recovery}${diagnostics.attempts.some((a) => a.outcome === "invalid-arguments") ? " The server rejected source settings; review the required values in Configure pane." : failures ? " Review the connection and try Refresh; source settings may also need updating." : ""}${diagnostics.configuration ? " Other sources need account or filter settings in Configure pane." : ""}${diagnostics.exhausted ? " Automatic fallback reached its read limit. Choose another ready source to continue." : ""}`,
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
