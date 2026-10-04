import type { MCPConnection } from "../types/domain";
// Deliberately omit endpoint, credentials, descriptions, defaults, examples,
// enum/const values and business responses. Schemas exported here are shapes
// for diagnosis, not executable replacements for the discovered schema.
export function discoveryDetails(c: MCPConnection) {
  const identifier = (s: string) =>
    /^[a-zA-Z_][a-zA-Z0-9_.-]{0,199}$/.test(s) ? s : "[redacted identifier]";
  function shape(value: unknown, depth = 0): unknown {
    if (
      depth > 8 ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      return {};
    const schema = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (
      typeof schema.type === "string" &&
      [
        "object",
        "array",
        "string",
        "number",
        "integer",
        "boolean",
        "null",
      ].includes(schema.type)
    )
      out.type = schema.type;
    if (Array.isArray(schema.required))
      out.required = schema.required
        .filter((v): v is string => typeof v === "string")
        .slice(0, 100)
        .map(identifier);
    if (
      schema.properties &&
      typeof schema.properties === "object" &&
      !Array.isArray(schema.properties)
    )
      out.properties = Object.fromEntries(
        Object.entries(schema.properties)
          .slice(0, 100)
          .map(([k, v]) => [identifier(k), shape(v, depth + 1)]),
      );
    if (schema.items) out.items = shape(schema.items, depth + 1);
    for (const k of [
      "minimum",
      "maximum",
      "minItems",
      "maxItems",
      "minLength",
      "maxLength",
    ])
      if (typeof schema[k] === "number" && Number.isFinite(schema[k]))
        out[k] = schema[k];
    if (typeof schema.additionalProperties === "boolean")
      out.additionalProperties = schema.additionalProperties;
    return out;
  }
  return {
    format: "gbot-mcp-discovery-shape-v1",
    note: "Endpoint, descriptions and literal schema values omitted. Reconnect to refresh annotations. Review identifiers before sharing.",
    tools: c.tools
      .slice(0, 500)
      .map((t) => ({
        name: identifier(t.name),
        annotations: t.annotations
          ? Object.fromEntries(
              Object.entries(t.annotations).filter(
                ([k, v]) =>
                  [
                    "readOnlyHint",
                    "destructiveHint",
                    "idempotentHint",
                    "openWorldHint",
                  ].includes(k) && typeof v === "boolean",
              ),
            )
          : null,
        schemaHash: /^[a-f0-9]{64}$/.test(t.schemaHash ?? "")
          ? t.schemaHash
          : undefined,
        enabled: t.enabled,
        risk: t.risk,
        requiresApproval: t.requiresApproval,
        inputSchemaShape: shape(t.inputSchema),
        outputSchemaShape: shape(t.outputSchema),
      })),
  };
}
