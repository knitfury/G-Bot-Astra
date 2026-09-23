import { DomainError } from "./errors";
export function remoteURL(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DomainError("INVALID_ARGUMENTS", "Enter a valid HTTPS URL.");
  }
  if (url.username || url.password || url.hash || url.search)
    throw new DomainError(
      "INVALID_ARGUMENTS",
      "Use an endpoint without credentials, query parameters or fragments; put tokens in credential fields.",
    );
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new DomainError(
      "INVALID_ARGUMENTS",
      "HTTPS is required except for loopback development endpoints.",
    );
  return url;
}
export function externalURL(value: string): string {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password)
    throw new DomainError(
      "INVALID_ARGUMENTS",
      "Only secure external links are supported.",
    );
  return u.href;
}
export function parseHeaders(value: string): Record<string, string> {
  let object: unknown;
  try {
    object = JSON.parse(value || "{}");
  } catch {
    throw new DomainError(
      "INVALID_ARGUMENTS",
      "Headers must be a JSON object.",
    );
  }
  if (!object || typeof object !== "object" || Array.isArray(object))
    throw new DomainError("INVALID_ARGUMENTS", "Headers must be an object.");
  const result: Record<string, string> = {};
  for (const [key, v] of Object.entries(object)) {
    if (
      !/^[a-zA-Z0-9-]{1,80}$/.test(key) ||
      typeof v !== "string" ||
      /[\r\n]/.test(v) ||
      /^(host|cookie|content-length|connection|proxy-|sec-)/i.test(key)
    )
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "Unsupported or invalid custom header.",
      );
    result[key] = v;
  }
  return result;
}
export function safePath(value: string): string[] {
  const parts = value.replace(/\[(\d+)\]/g, ".$1").split(".");
  if (
    !parts.length ||
    parts.some(
      (p) =>
        !/^[\w-]+$/.test(p) ||
        ["__proto__", "constructor", "prototype"].includes(p),
    )
  )
    throw new DomainError("INVALID_ARGUMENTS", "Invalid JSON mapping path.");
  return parts;
}
export function readPath(object: unknown, path: string): unknown {
  let value = object;
  for (const key of safePath(path))
    value =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : undefined;
  return value;
}
export function redactDiagnostic(code: string, event: string) {
  return {
    time: new Date().toISOString(),
    code: code.slice(0, 60),
    event: event.replace(/[^\w .-]/g, "").slice(0, 100),
  };
}
