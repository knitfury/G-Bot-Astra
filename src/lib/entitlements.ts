import type { Entitlement, MCPConnection, Plan } from "../types/domain";
export const PLAN_LIMITS: Record<Plan, number> = {
  free: 1,
  starter: 5,
  business: 8,
};
export const routersAvailable = (e: Entitlement) =>
  e.status === "active" && e.plan !== "free";
export const auditAvailable = (e: Entitlement) =>
  e.status === "active" && e.plan === "business";
export const isActiveConnection = (c: MCPConnection) =>
  c.enabled &&
  [
    "connected",
    "connecting",
    "authenticating",
    "reconnecting",
    "degraded",
  ].includes(c.status);
export const activeConnectionCount = (connections: MCPConnection[]) =>
  connections.filter(isActiveConnection).length;
export const canActivate = (
  e: Entitlement,
  connections: MCPConnection[],
  id?: string,
) =>
  e.status === "active" &&
  connections.filter((c) => c.id !== id && isActiveConnection(c)).length <
    e.maxActiveConnections;
export const connectionAvailable = (e: Entitlement, c: MCPConnection) =>
  e.status === "active" && c.enabled && c.status === "connected";
/** Stable saved order determines which active connections survive a downgrade. Never remove configurations or permissions. */
export function reconcileConnections(
  e: Entitlement,
  connections: MCPConnection[],
) {
  let count = 0;
  const paused: string[] = [];
  for (const c of connections)
    if (
      isActiveConnection(c) &&
      (e.status !== "active" || ++count > e.maxActiveConnections)
    ) {
      c.enabled = false;
      c.status = "inactive";
      paused.push(c.id);
    }
  return paused;
}
export const entitlementFor = (plan: Plan): Entitlement => ({
  plan,
  status: "active",
  maxActiveConnections: PLAN_LIMITS[plan],
  renewalAt: "2026-10-22",
  flags: { customProviders: true, approvals: true },
});
