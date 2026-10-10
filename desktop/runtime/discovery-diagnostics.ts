import { isObject } from "../../src/lib/context-inference";
const structural = new Set([
  "object",
  "array",
  "string",
  "integer",
  "number",
  "boolean",
  "null",
  "text",
  "image",
  "resource",
  "resource_link",
]);
/** Values are removed by default, not by a blacklist of sensitive field names. */
export function sanitizeDiscovery(value: unknown, schema = false): unknown {
  let budget = 1500;
  function visit(v: unknown, key = "", depth = 0): unknown {
    if (--budget < 0 || depth > 12) return "[truncated]";
    if (typeof v === "string") {
      if (schema && (key === "type" || key === "format") && structural.has(v))
        return v;
      if (
        schema &&
        key === "$ref" &&
        /^#\/(?:[A-Za-z_$][A-Za-z0-9_$~-]*\/?)+$/.test(v)
      )
        return v;
      if (!schema && key === "type" && structural.has(v)) return v;
      if (
        !schema &&
        key === "status" &&
        ["ok", "success", "error", "failed", "failure"].includes(v)
      )
        return v;
      if (!schema && key === "text" && v.length <= 200000) {
        try {
          return JSON.stringify(visit(JSON.parse(v), "", depth + 1));
        } catch {}
      }
      return "[redacted:string]";
    }
    if (typeof v === "boolean") return schema || key === "isError" ? v : false;
    if (typeof v === "number")
      return schema &&
        [
          "minimum",
          "maximum",
          "minLength",
          "maxLength",
          "minItems",
          "maxItems",
          "multipleOf",
        ].includes(key)
        ? v
        : 0;
    if (v === null || v === undefined) return null;
    if (Array.isArray(v))
      return v
        .slice(0, 8)
        .map((x) =>
          schema &&
          key === "required" &&
          typeof x === "string" &&
          /^[A-Za-z_$][A-Za-z0-9_$-]{0,80}$/.test(x)
            ? x
            : visit(x, key, depth + 1),
        );
    if (!isObject(v)) return "[redacted]";
    const out: Record<string, unknown> = {};
    for (const [name, child] of Object.entries(v).slice(0, 100)) {
      if (["__proto__", "constructor", "prototype"].includes(name)) continue;
      const safeName =
        /^[A-Za-z_$][A-Za-z0-9_$-]{0,80}$/.test(name) && !/\d{6,}/.test(name)
          ? name
          : `[redacted-key-${Object.keys(out).length}]`;
      out[safeName] = visit(child, name, depth + 1);
    }
    return out;
  }
  return visit(value);
}
