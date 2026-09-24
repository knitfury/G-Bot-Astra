import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { z } from "zod";
import { deviceInput, PLANS, planSchema } from "../model";
import { signEnvelope } from "./signing";
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function required(name: string) {
  const v = process.env[name];
  if (!v)
    throw new HttpError(503, "Service is not configured. Try again later.");
  return v;
}
export function adminClient() {
  if (process.env.GBOT_DESKTOP_SERVER === "1")
    throw new HttpError(503, "Cloud operations use the account portal.");
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function stripeClient() {
  const key = required("STRIPE_SECRET_KEY"),
    prod = process.env.NEXT_PUBLIC_GBOT_ENVIRONMENT === "production";
  if (!prod && !key.startsWith("sk_test_"))
    throw new HttpError(503, "Billing environment mismatch.");
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
}
export function origin() {
  const u = new URL(required("NEXT_PUBLIC_ACCOUNT_ORIGIN"));
  if (
    u.protocol !== "https:" &&
    !(
      process.env.NEXT_PUBLIC_GBOT_ENVIRONMENT === "development" &&
      u.hostname === "localhost"
    )
  )
    throw new HttpError(503, "Invalid account origin.");
  return u.origin;
}
export async function identity(req: Request, admin = false) {
  const token = req.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
  if (!token) throw new HttpError(401, "Sign in to continue.");
  const db = adminClient(),
    { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new HttpError(401, "Session expired. Sign in again.");
  const verified = await db.auth.getClaims(token);
  if (verified.error || !verified.data)
    throw new HttpError(401, "Session expired.");
  const claims = verified.data.claims,
    sid = z.string().uuid().safeParse(claims.session_id);
  if (!sid.success) throw new HttpError(401, "Invalid session.");
  const live = await db.rpc("session_live", { a: data.user.id, s: sid.data });
  if (live.error || live.data !== true)
    throw new HttpError(401, "Session revoked. Sign in again.");
  const factors = await db.auth.admin.mfa.listFactors({ userId: data.user.id });
  if (factors.error)
    throw new HttpError(503, "Security verification unavailable.");
  if (
    factors.data.factors.some((f) => f.status === "verified") &&
    claims.aal !== "aal2"
  )
    throw new HttpError(403, "Verify your authenticator code to continue.");
  const limit = await db.rpc("take_rate_limit", {
    k: `${admin ? "admin" : "account"}:${data.user.id}`,
    maximum: admin ? 30 : 90,
    seconds: 60,
  });
  if (limit.error || !limit.data)
    throw new HttpError(429, "Too many requests. Wait a minute and retry.");
  if (admin) {
    const role = await db
      .from("admin_roles")
      .select("account_id")
      .eq("account_id", data.user.id)
      .maybeSingle();
    if (role.error || !role.data || claims.aal !== "aal2")
      throw new HttpError(
        403,
        "An authorized administrator with verified MFA is required.",
      );
  }
  return { db, user: data.user, claims, sid: sid.data, token };
}
export async function body(req: Request) {
  const raw = await req.text();
  if (raw.length > 32_000) throw new HttpError(413, "Request too large.");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(e: unknown) {
  return json(
    {
      error:
        e instanceof HttpError
          ? e.message
          : e instanceof z.ZodError
            ? "Invalid request."
            : "Request failed safely. Retry or contact support.",
    },
    e instanceof HttpError ? e.status : e instanceof z.ZodError ? 400 : 503,
  );
}
export async function issue(req: Request) {
  const { db, user, sid } = await identity(req),
    d = deviceInput.parse(await body(req)),
    keyId = required("GBOT_LICENSE_KEY_ID");
  const r = await db.rpc("issue_license", {
    a: user.id,
    d: d.id,
    n: d.name,
    p: d.platform,
    v: d.version,
    s: sid,
    k: keyId,
  });
  if (r.error)
    throw new HttpError(
      403,
      "Device revoked or device limit reached. Manage devices in your account.",
    );
  const state = z
    .object({
      plan: planSchema,
      sequence: z.number().int(),
      issuedAt: z.number(),
      expiresAt: z.number(),
    })
    .parse(r.data);
  return json(
    signEnvelope(
      {
        version: 1,
        issuer: "g-bot",
        environment: z
          .enum(["development", "staging", "production"])
          .parse(process.env.NEXT_PUBLIC_GBOT_ENVIRONMENT),
        account: user.id,
        device: d.id,
        ...state,
        connections: PLANS[state.plan].connections,
        devices: PLANS[state.plan].devices,
        keyId,
      },
      keyId,
      required("GBOT_LICENSE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    ),
  );
}
export async function customer(account: string, email: string) {
  const db = adminClient(),
    s = stripeClient(),
    row = await db
      .from("billing")
      .select("customer_id,subscription_id")
      .eq("account_id", account)
      .single();
  if (row.error) throw row.error;
  if (row.data.customer_id)
    return row.data as { customer_id: string; subscription_id: string | null };
  const c = await s.customers.create(
    { email, metadata: { gbot_account: account } },
    { idempotencyKey: `customer-${account}` },
  );
  const saved = await db
    .from("billing")
    .update({ customer_id: c.id })
    .eq("account_id", account);
  if (saved.error) throw saved.error;
  return { customer_id: c.id, subscription_id: null };
}
export function prices() {
  return {
    starter_monthly: required("STRIPE_STARTER_MONTHLY_PRICE"),
    starter_annual: required("STRIPE_STARTER_ANNUAL_PRICE"),
    business_monthly: required("STRIPE_BUSINESS_MONTHLY_PRICE"),
    business_annual: required("STRIPE_BUSINESS_ANNUAL_PRICE"),
  };
}
export async function reconcile(
  customerId: string,
  eventId: string,
  eventType: string,
) {
  const observed = new Date().toISOString(),
    db = adminClient(),
    s = stripeClient();
  const account = await db
    .from("billing")
    .select("account_id")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (account.error) throw account.error;
  if (!account.data) return;
  const subs = await s.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const active = subs.data.filter((x) =>
    ["active", "trialing", "past_due", "unpaid"].includes(x.status),
  );
  if (active.length > 1)
    throw new HttpError(409, "Multiple subscriptions require billing review.");
  const sub = active[0],
    item = sub?.items.data[0],
    key = Object.entries(prices()).find(([, id]) => id === item?.price.id)?.[0];
  if (sub && (!key || sub.items.data.length !== 1))
    throw new HttpError(409, "Unknown subscription price requires review.");
  const plan = key?.startsWith("business")
    ? "business"
    : key
      ? "starter"
      : "free";
  const r = await db.rpc("reconcile_billing", {
    a: account.data.account_id,
    sub: sub?.id ?? null,
    price_plan: plan,
    new_status: sub?.status ?? "free",
    ends: item ? new Date(item.current_period_end * 1000).toISOString() : null,
    observed,
    event_id: eventId,
    event_type: eventType,
  });
  if (r.error) throw r.error;
}
