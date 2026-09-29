import type { Database, MCPConnection } from "@/types/domain";
// Examples are available only to the simulated workspace, never native runtime.
export const contextConnections = (db: Database): MCPConnection[] =>
  db.runtime
    ? db.connections
    : [...db.connections, ...(db.demoConnections ?? [])];

// Recognize only the old, untouched fixture identity/endpoint. Never infer a
// placeholder from category, inactive status, or slot (all valid user data).
export function isLegacyDemoConnection(c: MCPConnection): boolean {
  return (
    !c.userConfigured &&
    /^app-[0-7]$/.test(c.id) &&
    c.name ===
      [
        "Zoho Mail",
        "Customer CRM",
        "Stockroom",
        "Books",
        "Support Desk",
        "Team Calendar",
        "WorkDrive",
        "Projects",
      ][Number(c.id.slice(4))] &&
    c.url === `https://demo.example.com/${c.category.toLowerCase()}/mcp` &&
    c.lastConnected === "2026-09-22T09:00:00.000Z" &&
    (c.maskedCredential === "Demo credential ••••" ||
      c.maskedCredential === "Not authenticated")
  );
}
export function migrateDemoConnections(db: Database) {
  const examples = db.connections.filter(isLegacyDemoConnection);
  if (!examples.length) return;
  db.connections = db.connections.filter((c) => !isLegacyDemoConnection(c));
  if (!db.runtime) db.demoConnections ??= examples;
}
