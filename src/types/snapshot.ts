export const snapshotKinds = [
  "mail",
  "calendar",
  "inventory",
  "crm",
  "orders",
  "accounting",
  "shipping",
  "generic",
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
export interface SnapshotSource {
  source: "tool" | "resource";
  name: string;
  label: string;
  binding: string;
  eligible: boolean;
  reason: string;
  inputSchema?: Record<string, unknown>;
  template?: boolean;
}
export interface SnapshotItem {
  id: string;
  title: string;
  subtitle: string;
  preview: string;
  status: string;
  fields: Record<string, string>;
}
export interface BusinessSnapshot {
  connectionId: string;
  kind: SnapshotKind | null;
  state:
    | "ready"
    | "empty"
    | "partial"
    | "unknown"
    | "permission"
    | "disconnected"
    | "error";
  items: SnapshotItem[];
  refreshedAt: string | null;
  message: string;
  sourceTools: string[];
}
