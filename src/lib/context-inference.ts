import type {
  SnapshotKind,
  SnapshotItem,
  ContextPresentation,
  ContextField,
  SnapshotConfig,
} from "../types/snapshot";
export const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function humanLabel(v: string) {
  return v
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_./-]+/g, " ")
    .trim()
    .slice(0, 120);
}
const roles: [ContextField["role"], RegExp][] = [
  ["identifier", /^(id|.*_id|.*Id|sku|code)$/],
  ["timestamp", /date|time|created|updated|received|starts?|due/i],
  ["email", /email|fromAddress/i],
  ["person", /sender|from|owner|assignee|contact|customer/i],
  ["title", /^(name|title|subject|.*name)$/i],
  ["description", /description|preview|snippet|summary|body|content/i],
  ["status", /status|stage|state/i],
  ["quantity", /quantity|stock|count|total_count/i],
  ["currency", /currency/i],
  ["amount", /price|amount|value|total|balance/i],
  ["image", /image|thumbnail|avatar/i],
  ["url", /url|uri|link|href/i],
  ["category", /category|type|group/i],
];
export function fieldRole(key: string, schema?: unknown): ContextField["role"] {
  const s = isObject(schema) ? schema : {};
  if (s.format === "date-time" || s.format === "date") return "timestamp";
  if (s.format === "email") return "email";
  return (
    roles.find(([, re]) => re.test(key))?.[0] ??
    (s.format === "uri" ? "url" : "value")
  );
}
export function inferKind(metadata: string, schema?: unknown): SnapshotKind {
  let budget = 256;
  const names = (v: unknown, depth = 0): string => {
    if (!isObject(v) || depth > 5 || --budget < 0) return "";
    return Object.entries(v)
      .map(
        ([k, x]) =>
          (k === "properties" && isObject(x) ? Object.keys(x).join(" ") : "") +
          " " +
          (isObject(x) ? names(x, depth + 1) : ""),
      )
      .join(" ");
  };
  const words = humanLabel(metadata + " " + names(schema)).toLowerCase();
  for (const [kind, re] of [
    ["mail", /\b(mail|emails?|messages?|inbox|sender|subject)\b/],
    ["calendar", /\b(events?|meetings?|calendar|start date time)\b/],
    ["inventory", /\b(stock|inventory|products?|sku|quantity)\b/],
    ["crm", /\b(leads?|deals?|crm|stage)\b/],
    ["tasks", /\b(tasks?|projects?|assignee)\b/],
    ["support", /\b(tickets?|support)\b/],
    ["files", /\b(documents?|files?)\b/],
    ["orders", /\borders?\b/],
    ["accounting", /\b(invoices?|expenses?|balance)\b/],
    ["shipping", /\b(shipments?|tracking)\b/],
  ] as [SnapshotKind, RegExp][])
    if (re.test(words)) return kind;
  return "generic";
}
export function schemaCollection(schema: unknown, depth = 0): boolean {
  if (!isObject(schema) || depth > 4) return false;
  return (
    schema.type === "array" ||
    (isObject(schema.properties) &&
      Object.values(schema.properties)
        .slice(0, 40)
        .some((v) => schemaCollection(v, depth + 1)))
  );
}
function at(v: unknown, path: string): unknown {
  for (const k of path.split(".").filter(Boolean)) {
    if (
      !isObject(v) ||
      ["__proto__", "prototype", "constructor"].includes(k) ||
      !Object.hasOwn(v, k)
    )
      return undefined;
    v = v[k];
  }
  return v;
}
function flatten(
  v: unknown,
  prefix = "",
  depth = 0,
  out: Record<string, string> = {},
) {
  if (!isObject(v) || depth > 4) return out;
  for (const [k, x] of Object.entries(v).slice(0, 40)) {
    if (
      Object.keys(out).length >= 30 ||
      ["__proto__", "constructor", "prototype"].includes(k)
    )
      continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (x !== null && ["string", "number", "boolean"].includes(typeof x))
      out[key.slice(0, 200)] = String(x).slice(0, 4000);
    else if (isObject(x)) flatten(x, key, depth + 1, out);
    else if (
      Array.isArray(x) &&
      x.every(
        (y) => y === null || ["string", "number", "boolean"].includes(typeof y),
      )
    )
      out[key] = x.slice(0, 20).join(", ").slice(0, 4000);
  }
  return out;
}
export function normalizeContext(
  raw: string,
  hint: SnapshotKind = "generic",
  mapping?: SnapshotConfig["fields"],
  outputSchema?: Record<string, unknown>,
): {
  kind: SnapshotKind;
  items: SnapshotItem[];
  presentation: ContextPresentation;
  truncated: boolean;
} {
  if (raw.length > 200_000)
    throw Error("Context exceeds the supported size limit.");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  function unwrap(v: unknown, depth = 0): unknown {
    if (!isObject(v) || depth > 6) return v;
    if (v.isError === true) throw Error("Source reported an error.");
    if (v.structuredContent !== undefined) return v.structuredContent;
    const blocks = Array.isArray(v.contents)
      ? v.contents
      : Array.isArray(v.content)
        ? v.content
        : null;
    if (!blocks) return v;
    const values = blocks.slice(0, 50).flatMap((b): unknown[] => {
      if (!isObject(b)) return [];
      if (b.type === "resource" && isObject(b.resource))
        return [unwrap({ contents: [b.resource] }, depth + 1)];
      if (b.type === "resource_link")
        return [
          {
            title: b.title ?? b.name ?? "Resource link",
            uri: b.uri,
            description: b.description ?? "",
          },
        ];
      if (typeof b.text === "string") {
        try {
          return [JSON.parse(b.text)];
        } catch {
          return [b.text];
        }
      }
      if (typeof b.blob === "string")
        return [
          {
            title: "Binary resource",
            mimeType: b.mimeType ?? "unknown",
            description: "Binary content is not previewed automatically.",
          },
        ];
      return [];
    });
    return values.length === 1 ? values[0] : values;
  }
  data = unwrap(data);
  let budget = 256;
  const collections: { path: string; rows: unknown[]; score: number }[] = [];
  function visit(v: unknown, path = "", depth = 0) {
    if (--budget < 0 || depth > 6) return;
    if (Array.isArray(v)) {
      collections.push({ path, rows: v, score: v.some(isObject) ? 20 : 5 });
      return;
    }
    if (isObject(v))
      for (const [k, x] of Object.entries(v).slice(0, 40))
        visit(x, path ? `${path}.${k}` : k, depth + 1);
  }
  visit(data);
  const chosen = collections.sort((a, b) => b.score - a.score)[0];
  const mapped = mapping?.rows ? at(data, mapping.rows) : undefined;
  const collection = Array.isArray(mapped) ? mapped : chosen?.rows;
  const list =
    collection ?? (data === null || data === undefined ? [] : [data]);
  const texts = list.filter((x): x is string => typeof x === "string");
  if (texts.length === list.length && texts.length)
    return {
      kind: hint,
      items: texts.slice(0, 50).map((text, i) => ({
        id: String(i),
        title: "Document",
        subtitle: "",
        preview: text.slice(0, 12000),
        status: "",
        fields: {},
      })),
      presentation: { type: "document", fields: [] },
      truncated: list.length > 50 || texts.some((x) => x.length > 12000),
    };
  const flat = list
    .slice(0, 50)
    .map((x) => (isObject(x) ? flatten(x) : { value: String(x ?? "") }));
  const keys = [...new Set(flat.flatMap(Object.keys))].slice(0, 30);
  function recordSchema(v: unknown, depth = 0): Record<string, unknown> {
    if (!isObject(v) || depth > 5) return {};
    if (v.type === "array") return isObject(v.items) ? v.items : {};
    if (isObject(v.properties)) {
      for (const x of Object.values(v.properties).slice(0, 40))
        if (schemaCollection(x)) return recordSchema(x, depth + 1);
      return v;
    }
    return {};
  }
  const record = recordSchema(outputSchema);
  function propertySchema(path: string): unknown {
    let s: unknown = record;
    for (const key of path.split(".")) {
      if (!isObject(s) || !isObject(s.properties)) return undefined;
      s = s.properties[key];
    }
    return s;
  }
  const fields: ContextField[] = keys.map((key) => ({
    key,
    label: humanLabel(key),
    role: fieldRole(key.split(".").at(-1)!, propertySchema(key)),
  }));
  const inferred = inferKind(keys.join(" ") + " " + (chosen?.path ?? ""));
  const kind = inferred === "generic" ? hint : inferred;
  const items: SnapshotItem[] = (keys.length ? flat : []).map((values, i) => {
    const role = (...r: ContextField["role"][]) =>
      fields
        .filter((f) => r.includes(f.role))
        .map((f) => values[f.key])
        .find(Boolean) ?? "";
    const mappedText = (key: "title" | "subtitle" | "preview") => {
      const x = mapping?.[key] ? at(list[i], mapping[key]!) : undefined;
      return x !== undefined &&
        ["string", "number", "boolean"].includes(typeof x)
        ? String(x).slice(0, 4000)
        : "";
    };
    const details = Object.fromEntries(
      fields
        .filter((f) => values[f.key] !== undefined)
        .map((f) => [f.label, values[f.key]]),
    );
    const stock = fields.find((f) => /stock|quantity/i.test(f.key));
    if (stock) details.Stock = values[stock.key];
    const sender = fields.find(
      (f) => f.role === "person" || f.role === "email",
    );
    if (kind === "mail" && sender) details.Sender = values[sender.key];
    return {
      id: `${role("identifier") || "record"}:${i}`,
      title:
        mappedText("title") ||
        role("title") ||
        Object.values(values)[0] ||
        `Record ${i + 1}`,
      subtitle: mappedText("subtitle") || role("person", "email", "identifier"),
      preview: mappedText("preview") || role("description"),
      status: role("status"),
      fields: details,
      values,
    };
  });
  let type: ContextPresentation["type"] = "table";
  if (!collection)
    type =
      fields.length &&
      flat[0] &&
      Object.values(flat[0]).every(
        (v) => v.trim() !== "" && Number.isFinite(Number(v)),
      )
        ? "metrics"
        : fields.length <= 2
          ? "key-value"
          : "detail";
  else if (kind === "mail") type = "messages";
  else if (
    kind === "calendar" ||
    (fields.some((f) => f.role === "timestamp") &&
      !fields.some((f) => f.role === "amount" || f.role === "quantity"))
  )
    type = "timeline";
  else if (kind === "inventory" || fields.some((f) => f.role === "image"))
    type = "cards";
  else if (kind !== "generic") type = "list";
  return {
    kind,
    items,
    presentation: { type, fields },
    truncated: list.length > 50,
  };
}
