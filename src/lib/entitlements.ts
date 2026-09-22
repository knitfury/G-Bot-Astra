import type { Entitlement, MCPConnection, Plan } from "@/types/domain";
export const PLAN_LIMITS: Record<Plan, number> = {
  free: 1,
  starter: 5,
  business: 8,
};
export const requiredPlan = (slot: number): Plan =>
  slot < 1 ? "free" : slot < 5 ? "starter" : "business";
export const slotAvailable = (e: Entitlement, slot: number) =>
  e.status === "active" && slot < e.maxActiveConnections;
export const connectionAvailable = (e: Entitlement, c: MCPConnection) =>
  slotAvailable(e, c.slot) && c.enabled && c.status === "connected";
export const entitlementFor = (plan: Plan): Entitlement => ({
  plan,
  status: "active",
  maxActiveConnections: PLAN_LIMITS[plan],
  renewalAt: "2026-10-22",
  flags: { customProviders: true, approvals: true },
});
