import Ajv from "ajv";
import {
  emptyParameterContainers,
  validateParameters,
} from "../../src/lib/context-parameters";
import { UriTemplate } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import {
  humanLabel,
  inferKind,
  isObject,
  schemaCollection,
} from "../../src/lib/context-inference";
import type { SnapshotSource, SnapshotConfig } from "../../src/types/snapshot";
export function argumentPlan(
  schema: Record<string, unknown> = { type: "object" },
  supplied?: Record<string, unknown>,
) {
  let args: Record<string, unknown> = supplied ? { ...supplied } : {};
  try {
    if (JSON.stringify(schema).length > 50000) throw Error();
    const validate = new Ajv({ strict: false, validateFormats: false }).compile(
      schema,
    );
    if (!supplied && isObject(schema.properties))
      for (const [key, prop] of Object.entries(schema.properties)) {
        // Only bounded pagination controls are synthesized. Never invent business IDs,
        // credentials, search filters or actions from third-party defaults/examples.
        if (
          /^(limit|page_size|per_page|pageSize)$/.test(key) &&
          isObject(prop) &&
          prop.type === "integer"
        ) {
          const min = typeof prop.minimum === "number" ? prop.minimum : 1;
          const max = typeof prop.maximum === "number" ? prop.maximum : 20;
          if (min <= 20 && max >= 1) args[key] = Math.min(20, max);
        }
      }
    if (!supplied) args = emptyParameterContainers(schema, args);
    const valid = validate(args);
    const needs = validateParameters(schema, args)
      .issues.filter((i) => i.path)
      .map((i) => i.path);
    return { args, valid: !!valid, needs, malformed: false };
  } catch {
    return { args: {}, valid: false, needs: [], malformed: true };
  }
}
export function rankSource(
  source: SnapshotSource,
  config?: SnapshotConfig,
): SnapshotSource {
  if (source.outputSchema) {
    try {
      if (JSON.stringify(source.outputSchema).length > 50000) throw Error();
      new Ajv({ strict: false, validateFormats: false }).compile(
        source.outputSchema,
      );
    } catch {
      return {
        ...source,
        eligible: false,
        safety: "blocked",
        reason: "Invalid output schema.",
        score: -100,
      };
    }
  }
  let schema = source.inputSchema;
  if (source.source === "resource" && source.template) {
    try {
      const names = new UriTemplate(source.name).variableNames;
      schema = {
        type: "object",
        properties: Object.fromEntries(
          names.map((k) => [k, { type: "string", minLength: 1 }]),
        ),
        required: names,
        additionalProperties: false,
      };
    } catch {
      return {
        ...source,
        eligible: false,
        safety: "blocked",
        reason: "Invalid resource template.",
        score: -100,
      };
    }
  }
  const match =
    config?.source === source.source &&
    config.name === source.name &&
    config.binding === source.binding;
  const plan = argumentPlan(
    schema,
    match ? config.arguments : source.defaults?.arguments,
  );
  const kind = match
    ? config.kind
    : (source.defaults?.kind ??
      inferKind(
        `${source.label} ${source.description ?? ""}`,
        source.outputSchema,
      ));
  const ready = plan.valid && !plan.malformed;
  const words = humanLabel(
    `${source.name} ${source.label} ${source.description ?? ""}`,
  ).toLowerCase();
  const business =
    schemaCollection(source.outputSchema) ||
    /\b(records?|emails?|messages?|inbox|tasks?|tickets?|orders?|invoices?|products?|stock|events?|customers?|contacts?|documents?)\b/.test(
      words,
    );
  const purpose =
    /\b(policy|policies|restriction|subscription|audit|login|permission|domain|configuration|settings)\b/.test(
      words,
    )
      ? "administrative"
      : /\b(accounts?|folders?|mailboxes?|workspaces?|projects?|warehouses?|locations?|organizations?)\b/.test(
            humanLabel(`${source.name} ${source.label}`).toLowerCase(),
          ) && /list|get|fetch|available/.test(words)
        ? "discovery"
        : business
          ? "business"
          : /\b(health|ping|status|capabilities)\b/.test(words)
            ? "status"
            : "generic";
  let score = source.source === "resource" ? 100 : 30;
  if (ready) score += 50;
  if (purpose === "business") score += 40;
  if (purpose === "administrative") score -= 120;
  if (purpose === "status") score -= 150;
  if (schemaCollection(source.outputSchema)) score += 25;
  if (/recent|overview|list|upcoming|catalog|summary/i.test(words)) score += 10;
  if (source.outputSchema || /json|text/i.test(source.mimeType ?? ""))
    score += 10;
  if (plan.needs.length) score -= 100;
  if (!source.eligible || plan.malformed) score = -100;
  return {
    ...source,
    label: humanLabel(source.label || source.name),
    inputSchema: schema,
    kind,
    arguments: plan.args,
    needs: plan.needs,
    score,
    purpose,
    readiness:
      !source.eligible || plan.malformed
        ? source.safety === "permission"
          ? "permission"
          : "blocked"
        : ready
          ? "ready"
          : "configuration",
    eligible: source.eligible && !plan.malformed,
    safety: plan.malformed
      ? "blocked"
      : (source.safety ?? (source.eligible ? "allowed" : "blocked")),
    reason: plan.malformed
      ? "This source has an invalid or unsupported schema."
      : source.reason,
  };
}
