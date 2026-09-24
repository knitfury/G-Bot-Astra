"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export function accountClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR-"))
    throw Error(
      "Account services are not configured yet. Please try again later. Demo Mode remains available.",
    );
  client = createClient(url, key, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      detectSessionInUrl: true,
      storage:
        typeof window === "undefined" ? undefined : window.sessionStorage,
    },
  });
  return client;
}
export async function control<T>(
  action: string,
  value: unknown = {},
): Promise<T> {
  const session = await accountClient().auth.getSession();
  if (!session.data.session) throw Error("Sign in to continue.");
  const r = await fetch(`/api/control/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.data.session.access_token}`,
    },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(25000),
  });
  const result = await r.json();
  if (!r.ok)
    throw Error(
      typeof result.error === "string"
        ? result.error
        : "Request failed. Retry.",
    );
  return result as T;
}
export function billingRedirect(url: string) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !["checkout.stripe.com", "billing.stripe.com"].includes(u.hostname)
  )
    throw Error("Billing destination is invalid.");
  window.location.assign(u.href);
}
