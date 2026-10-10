import Ajv from "ajv";
import { humanLabel, isObject } from "./context-inference";
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
export interface ParameterField {
  path: string;
  label: string;
  description: string;
  required: boolean;
  schema: Record<string, unknown>;
  complex: boolean;
}
export function resolveParameterSchema(
  root: Record<string, unknown>,
  input: unknown,
) {
  let schema = isObject(input) ? input : {};
  const seen = new Set<string>();
  for (let i = 0; i < 6 && typeof schema.$ref === "string"; i++) {
    const ref = schema.$ref;
    if (!ref.startsWith("#/") || seen.has(ref)) return {};
    seen.add(ref);
    let value: unknown = root;
    for (const part of ref.slice(2).split("/")) {
      const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
      if (forbidden.has(key) || !isObject(value) || !Object.hasOwn(value, key))
        return {};
      value = value[key];
    }
    schema = isObject(value)
      ? {
          ...value,
          ...Object.fromEntries(
            Object.entries(schema).filter(([key]) => key !== "$ref"),
          ),
        }
      : {};
  }
  return schema;
}
export function parameterFields(
  root: Record<string, unknown> = { type: "object" },
): ParameterField[] {
  const fields: ParameterField[] = [];
  let budget = 100;
  function visit(
    input: unknown,
    path: string,
    required: boolean,
    depth: number,
  ) {
    if (--budget < 0 || depth > 5) return;
    const schema = resolveParameterSchema(root, input);
    const composite = [
      "oneOf",
      "anyOf",
      "allOf",
      "if",
      "dependentSchemas",
      "dependencies",
    ].some((k) => schema[k] !== undefined);
    if (
      !composite &&
      isObject(schema.properties) &&
      (schema.type === "object" || !schema.type)
    ) {
      for (const [key, property] of Object.entries(schema.properties).slice(
        0,
        30,
      )) {
        if (forbidden.has(key) || key.includes(".")) continue;
        visit(
          property,
          path ? `${path}.${key}` : key,
          required &&
            Array.isArray(schema.required) &&
            schema.required.includes(key),
          depth + 1,
        );
      }
      if (Object.keys(schema.properties).length) return;
    }
    if (!path) return;
    const scalar = ["string", "integer", "number", "boolean"].includes(
      String(schema.type),
    );
    fields.push({
      path,
      schema,
      required,
      complex: composite || !scalar,
      label:
        typeof schema.title === "string"
          ? schema.title.slice(0, 120)
          : humanLabel(path.split(".").at(-1)!),
      description:
        typeof schema.description === "string"
          ? schema.description.slice(0, 300)
          : "",
    });
  }
  visit(root, "", true, 0);
  return fields;
}
export function parameterValue(args: unknown, path: string): unknown {
  for (const key of path.split(".")) {
    if (forbidden.has(key) || !isObject(args) || !Object.hasOwn(args, key))
      return undefined;
    args = args[key];
  }
  return args;
}
export function setParameter(
  args: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const out = structuredClone(args);
  const keys = path.split(".");
  if (keys.some((k) => forbidden.has(k))) return out;
  let object = out;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(object[key])) object[key] = {};
    object = object[key] as Record<string, unknown>;
  }
  if (value === undefined) delete object[keys.at(-1)!];
  else object[keys.at(-1)!] = value;
  return out;
}
export function validateParameters(
  schema: Record<string, unknown> = { type: "object" },
  args: unknown,
) {
  try {
    if (JSON.stringify(schema).length > 50000) throw Error();
    const validate = new Ajv({
      strict: false,
      validateFormats: false,
      allErrors: true,
    }).compile(schema);
    const valid = validate(args);
    const fields = parameterFields(schema);
    const issues = (validate.errors ?? [])
      .slice(0, 20)
      .flatMap((e) => {
        const parent = e.instancePath
          .split("/")
          .filter(Boolean)
          .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"));
        const path = [
          ...parent,
          ...(e.keyword === "required"
            ? [String(e.params.missingProperty)]
            : []),
        ].join(".");
        if (e.keyword === "required") {
          const children = fields.filter(
            (f) => f.required && f.path.startsWith(path + "."),
          );
          if (children.length)
            return children.map((f) => ({
              path: f.path,
              message: `${f.label}: choose a value.`,
            }));
        }
        const field = fields.find((f) => f.path === path);
        const label =
          field?.label || humanLabel(path.split(".").at(-1) || "Parameters");
        return [
          {
            path,
            message: `${label}: ${e.keyword === "required" ? "choose a value" : "check the value against this source’s requirements"}.`,
          },
        ];
      })
      .slice(0, 20);
    return { valid: !!valid, malformed: false, issues };
  } catch {
    return {
      valid: false,
      malformed: true,
      issues: [
        {
          path: "",
          message: "This source has an unsupported parameter schema.",
        },
      ],
    };
  }
}
// Only schema-declared, required object containers that validate as empty may be
// synthesized. Never synthesize IDs, filters, enum values, examples or defaults.
export function emptyParameterContainers(
  root: Record<string, unknown>,
  args: Record<string, unknown>,
) {
  const out = structuredClone(args);
  function visit(
    input: unknown,
    object: Record<string, unknown>,
    depth: number,
  ) {
    if (depth > 5) return;
    const s = resolveParameterSchema(root, input);
    if (!isObject(s.properties) || !Array.isArray(s.required)) return;
    for (const key of s.required.slice(0, 30)) {
      if (typeof key !== "string" || forbidden.has(key)) continue;
      const child = resolveParameterSchema(root, s.properties[key]);
      if (child.type !== "object" || !isObject(child.properties)) continue;
      if (!Object.hasOwn(object, key) && validateParameters(child, {}).valid)
        object[key] = {};
      if (isObject(object[key])) visit(child, object[key], depth + 1);
    }
  }
  visit(root, out, 0);
  return out;
}
export function choiceRecordBinding(
  output: Record<string, unknown> | undefined,
  field: ParameterField,
): { collection: string; path: string } | undefined {
  if (!output || field.complex) return;
  let budget = 100;
  const leaf = field.path.split(".").at(-1)!.replace(/[_-]/g, "").toLowerCase();
  const matches: { collection: string; path: string }[] = [];
  function collection(input: unknown, depth: number, prefix = ""): void {
    if (--budget < 0 || depth > 5) return;
    const s = resolveParameterSchema(output!, input);
    if (s.type === "array") {
      const paths = record(s.items, "", depth + 1);
      for (const path of paths) matches.push({ collection: prefix, path });
      return;
    }
    if (isObject(s.properties))
      for (const [key, child] of Object.entries(s.properties)) {
        if (forbidden.has(key) || key.includes(".")) continue;
        collection(child, depth + 1, prefix ? `${prefix}.${key}` : key);
      }
  }
  function record(input: unknown, path: string, depth: number): string[] {
    if (--budget < 0 || depth > 6) return [];
    const s = resolveParameterSchema(output!, input);
    if (!isObject(s.properties)) return [];
    const paths: string[] = [];
    for (const [key, child] of Object.entries(s.properties)) {
      if (forbidden.has(key) || key.includes(".")) continue;
      const p = path ? `${path}.${key}` : key;
      const resolved = resolveParameterSchema(output!, child);
      if (
        key.replace(/[_-]/g, "").toLowerCase() === leaf &&
        resolved.type === field.schema.type
      )
        paths.push(p);
      paths.push(...record(child, p, depth + 1));
    }
    return paths;
  }
  collection(output, 0);
  return budget >= 0 && matches.length === 1 ? matches[0] : undefined;
}

export function choiceRecordPath(
  output: Record<string, unknown> | undefined,
  field: ParameterField,
): string | undefined {
  return choiceRecordBinding(output, field)?.path;
}

export function requiresAdvancedParameters(
  schema: Record<string, unknown> | undefined,
) {
  if (!schema) return false;
  const root = resolveParameterSchema(schema, schema);
  const fields = parameterFields(schema);
  return (
    fields.some((f) => f.complex) ||
    ["oneOf", "anyOf", "allOf", "if", "dependentSchemas", "dependencies"].some(
      (k) => root[k] !== undefined,
    ) ||
    (isObject(root.properties) &&
      Object.keys(root.properties).length > 0 &&
      fields.length === 0)
  );
}

// Browser validation must not compile schemas into JavaScript: the renderer CSP
// forbids unsafe-eval. Check supported field constraints here; the runtime always
// performs full JSON Schema validation, including advanced conditional schemas.
export function validateParameterInputs(
  schema: Record<string, unknown> | undefined,
  args: unknown,
) {
  const root = schema ?? { type: "object" };
  const fields = parameterFields(root);
  const issues: { path: string; message: string }[] = [];
  let budget = 200;
  function issue(path: string, required = false) {
    const field = fields.find((f) => f.path === path);
    const children = required
      ? fields.filter((f) => f.required && f.path.startsWith(path + "."))
      : [];
    for (const f of children.length
      ? children
      : [
          {
            path,
            label:
              field?.label ??
              humanLabel(path.split(".").at(-1) || "Parameters"),
          },
        ]) {
      if (issues.length < 20)
        issues.push({
          path: f.path,
          message: `${f.label}: ${required ? "choose a value" : "check the value against this source’s requirements"}.`,
        });
    }
  }
  function visit(input: unknown, value: unknown, path: string, depth: number) {
    if (--budget < 0 || depth > 6) return;
    const s = resolveParameterSchema(root, input);
    const types = Array.isArray(s.type) ? s.type : [s.type];
    const matches = (t: unknown) =>
      t === undefined ||
      (t === "null" && value === null) ||
      (t === "object" && isObject(value)) ||
      (t === "array" && Array.isArray(value)) ||
      (t === "string" && typeof value === "string") ||
      (t === "boolean" && typeof value === "boolean") ||
      (t === "number" && typeof value === "number" && Number.isFinite(value)) ||
      (t === "integer" &&
        typeof value === "number" &&
        Number.isSafeInteger(value));
    if (!types.some(matches)) {
      issue(path);
      return;
    }
    if (
      Array.isArray(s.enum) &&
      !s.enum.some((v) => JSON.stringify(v) === JSON.stringify(value))
    )
      issue(path);
    if (
      s.const !== undefined &&
      JSON.stringify(s.const) !== JSON.stringify(value)
    )
      issue(path);
    if (typeof value === "string") {
      const length = Array.from(value).length;
      if (
        (typeof s.minLength === "number" && length < s.minLength) ||
        (typeof s.maxLength === "number" && length > s.maxLength)
      )
        issue(path);
      if (typeof s.pattern === "string")
        try {
          if (!new RegExp(s.pattern, "u").test(value)) issue(path);
        } catch {
          issue(path);
        }
    }
    if (
      typeof value === "number" &&
      ((typeof s.minimum === "number" && value < s.minimum) ||
        (typeof s.maximum === "number" && value > s.maximum) ||
        (typeof s.exclusiveMinimum === "number" &&
          value <= s.exclusiveMinimum) ||
        (typeof s.exclusiveMaximum === "number" &&
          value >= s.exclusiveMaximum) ||
        (typeof s.multipleOf === "number" &&
          s.multipleOf > 0 &&
          Math.abs(value / s.multipleOf - Math.round(value / s.multipleOf)) >
            1e-8))
    )
      issue(path);
    if (isObject(value) && isObject(s.properties)) {
      for (const key of Array.isArray(s.required)
        ? s.required.slice(0, 30)
        : [])
        if (
          typeof key === "string" &&
          !forbidden.has(key) &&
          !Object.hasOwn(value, key)
        )
          issue(path ? `${path}.${key}` : key, true);
      for (const [key, child] of Object.entries(s.properties).slice(0, 30))
        if (!forbidden.has(key) && Object.hasOwn(value, key))
          visit(child, value[key], path ? `${path}.${key}` : key, depth + 1);
      if (
        s.additionalProperties === false &&
        Object.keys(value).some(
          (k) => !Object.hasOwn(s.properties as object, k),
        )
      )
        issue(path);
    }
  }
  if (!isObject(args)) issue("");
  else visit(root, args, "", 0);
  return { valid: issues.length === 0, issues };
}
