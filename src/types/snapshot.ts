export const snapshotKinds = [
  "mail",
  "calendar",
  "inventory",
  "crm",
  "orders",
  "accounting",
  "shipping",
  "generic",
  "tasks",
  "support",
  "files",
] as const;
export type SnapshotKind = (typeof snapshotKinds)[number];
export interface SnapshotConfig {
  endpoint: string;
  source: "tool" | "resource";
  name: string;
  binding: string;
  kind: SnapshotKind;
  arguments: Record<string, unknown>;
  fields?: {
    rows?: string;
    title?: string;
    subtitle?: string;
    preview?: string;
  };
}
export interface ContextField {
  key: string;
  label: string;
  role:
    | "title"
    | "subtitle"
    | "identifier"
    | "timestamp"
    | "person"
    | "email"
    | "status"
    | "amount"
    | "currency"
    | "quantity"
    | "image"
    | "description"
    | "url"
    | "category"
    | "value";
}
export interface ContextPresentation {
  type:
    | "list"
    | "table"
    | "cards"
    | "metrics"
    | "timeline"
    | "messages"
    | "detail"
    | "document"
    | "key-value";
  fields: ContextField[];
}
export interface SnapshotSource {
  purpose?: "business" | "discovery" | "generic" | "status" | "administrative";
  readiness?: "ready" | "configuration" | "permission" | "blocked";
  description?: string;
  mimeType?: string;
  outputSchema?: Record<string, unknown>;
  score?: number;
  kind?: SnapshotKind;
  arguments?: Record<string, unknown>;
  needs?: string[];
  safety?: "allowed" | "blocked" | "permission";
  source: "tool" | "resource";
  name: string;
  label: string;
  binding: string;
  eligible: boolean;
  reason: string;
  inputSchema?: Record<string, unknown>;
  template?: boolean;
  defaults?: {
    kind: SnapshotKind;
    arguments: Record<string, unknown>;
    fields?: SnapshotConfig["fields"];
  };
  authority?: "server-declared" | "signed-catalog";
}
export interface SnapshotItem {
  values?: Record<string, string>;
  id: string;
  title: string;
  subtitle: string;
  preview: string;
  status: string;
  fields: Record<string, string>;
}
export interface ParameterChoices {
  choices: { value: string | number | boolean; label: string }[];
  message: string;
}
export type ContextOutcome =
  | "records"
  | "empty"
  | "status-only"
  | "missing-parameters"
  | "disabled"
  | "blocked"
  | "invalid-arguments"
  | "tool-error"
  | "changed";
export interface ContextDiagnostics {
  format: "gbot-context-outcomes-v1";
  mode: "automatic" | "selected";
  ready: number;
  configuration: number;
  disabled: number;
  blocked: number;
  attempts: {
    source: number;
    outcome: ContextOutcome;
    records: number;
    code?: string;
  }[];
  exhausted: boolean;
}
export interface BusinessSnapshot {
  diagnostics?: ContextDiagnostics;
  presentation?: ContextPresentation;
  sources?: SnapshotSource[];
  selectedSource?: string;
  truncated?: boolean;
  connectionId: string;
  kind: SnapshotKind | null;
  state:
    | "ready"
    | "empty"
    | "partial"
    | "unknown"
    | "configuration"
    | "permission"
    | "disconnected"
    | "error";
  items: SnapshotItem[];
  refreshedAt: string | null;
  message: string;
  sourceTools: string[];
}
