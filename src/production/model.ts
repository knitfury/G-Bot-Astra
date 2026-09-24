import { z } from "zod";
export const planSchema = z.enum(["free", "starter", "business"]);
export type Plan = z.infer<typeof planSchema>;
export const PLANS = {
  free: { name: "Free", monthly: 0, annual: 0, connections: 1, devices: 1 },
  starter: {
    name: "Starter",
    monthly: 14,
    annual: 140,
    connections: 5,
    devices: 2,
  },
  business: {
    name: "Business",
    monthly: 29,
    annual: 290,
    connections: 8,
    devices: 3,
  },
} as const;
export const DAY = 86_400_000;
export const licenseSchema = z
  .object({
    version: z.literal(1),
    issuer: z.literal("g-bot"),
    environment: z.enum(["development", "staging", "production"]),
    account: z.string().uuid(),
    device: z.string().uuid(),
    sequence: z.number().int().positive(),
    plan: planSchema,
    connections: z.number().int(),
    devices: z.number().int(),
    issuedAt: z.number().int(),
    expiresAt: z.number().int(),
    keyId: z.string().min(1).max(80),
  })
  .strict();
export type License = z.infer<typeof licenseSchema>;
export const signedSchema = z
  .object({
    payload: z.string().max(500_000),
    signature: z.string().max(200),
    keyId: z.string().max(80),
  })
  .strict();
export type Signed = z.infer<typeof signedSchema>;
export const deviceInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80),
    platform: z.enum(["win32", "darwin"]),
    version: z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/),
  })
  .strict();
export const catalogEntry = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,80}$/),
    name: z.string().max(100),
    icon: z.string().max(30),
    category: z.enum([
      "CRM",
      "Accounting",
      "Email & Communication",
      "Ecommerce",
      "Inventory",
      "Shipping & Logistics",
    ]),
    description: z.string().max(500),
    useCases: z.array(z.string().max(200)).max(10),
    setup: z.string().max(4000),
    auth: z.enum(["OAuth", "Token"]),
    endpoint: z.string().url(),
    docs: z.string().url(),
    transport: z.literal("streamable-http"),
    minimumVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    status: z.enum(["review", "recommended", "disabled"]),
    reviewedAt: z.string().datetime(),
    evidence: z.string().max(2000),
  })
  .strict()
  .refine(
    (v) =>
      [v.endpoint, v.docs].every((s) => {
        const u = new URL(s);
        return (
          u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          !u.hash &&
          !u.search
        );
      }),
    "HTTPS metadata without credentials required",
  )
  .refine(
    (v) => v.status !== "recommended" || v.evidence.length > 20,
    "Acceptance evidence required",
  );
export const catalogSchema = z
  .object({
    version: z.literal(1),
    sequence: z.number().int().positive(),
    issuedAt: z.number(),
    expiresAt: z.number(),
    entries: z.array(catalogEntry).max(200),
    disabledFeatures: z.array(z.enum(["recommended", "updates"])).max(2),
  })
  .strict();
export type Catalog = z.infer<typeof catalogSchema>;
export interface SubscriptionState {
  plan: Plan;
  status: string;
  periodEnd: number;
  graceStartedAt: number | null;
}
export function effectivePlan(
  state: SubscriptionState | null,
  now = Date.now(),
): Plan {
  if (!state) return "free";
  if (
    (state.status === "active" || state.status === "trialing") &&
    state.periodEnd > now
  )
    return state.plan;
  if (
    state.status === "past_due" &&
    state.graceStartedAt !== null &&
    now < state.graceStartedAt + 7 * DAY
  )
    return state.plan;
  return "free";
}
export function enforceConnectionLimit<
  T extends { slot: number; enabled: boolean },
>(connections: T[], plan: Plan): T[] {
  return connections.map((c) => ({
    ...c,
    enabled: c.enabled && c.slot < PLANS[plan].connections,
  }));
}
