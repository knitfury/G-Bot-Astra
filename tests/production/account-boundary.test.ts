import test from "node:test";
import assert from "node:assert/strict";
import { mockServices } from "../../src/services/mocks";
import { get } from "../../src/services/mocks/database";
import {
  accountClient,
  control,
  billingRedirect,
} from "../../src/production/web/client";

test("mock credential entry fails closed and Demo plans never become Supabase sessions", async () => {
  await assert.rejects(
    () => mockServices.auth.login("any@example.invalid", "password123"),
    /\/portal/,
  );
  await assert.rejects(
    () => mockServices.auth.signup("Any", "any@example.invalid", "password123"),
    /\/portal/,
  );
  assert.equal(get().user, null);
  await mockServices.auth.demo();
  await mockServices.entitlements.change("business");
  assert.equal(get().user?.id, "demo-user");
  assert.equal(get().entitlement.plan, "business");
  assert.throws(() => accountClient(), /not configured/);
});

test("portal uses the real Supabase SDK protocol and server entitlement independently of Demo", async () => {
  const oldFetch = globalThis.fetch;
  const oldURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://gbot-fixture.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-anon-key";
  const requests: { path: string; body: unknown; auth: string | null }[] = [];
  let serverPlan = "free";
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "real@example.invalid",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://account.example");
    const headers = new Headers(init?.headers);
    requests.push({
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      auth: headers.get("authorization"),
    });
    if (url.pathname === "/auth/v1/signup")
      return Response.json({ user, session: null });
    if (url.pathname === "/auth/v1/token")
      return Response.json({
        access_token: "fixture-access-token",
        refresh_token: "fixture-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    if (url.pathname === "/auth/v1/logout")
      return new Response(null, { status: 204 });
    if (url.pathname === "/api/control/account") {
      assert.equal(headers.get("authorization"), "Bearer fixture-access-token");
      return Response.json({
        email: user.email,
        name: "Real account",
        plan: serverPlan,
        billing: { status: serverPlan === "free" ? "free" : "active" },
        devices: [],
      });
    }
    if (
      url.pathname === "/api/control/checkout" ||
      url.pathname === "/api/control/billing"
    )
      return Response.json({
        url: "https://checkout.stripe.com/c/pay/fixture",
      });
    throw Error(`Unexpected request: ${url.pathname}`);
  };
  try {
    const client = accountClient();
    assert.equal((await client.auth.getSession()).data.session, null);
    await assert.rejects(() => control("account"), /Sign in/);
    const signup = await client.auth.signUp({
      email: user.email,
      password: "test-password-123",
    });
    assert.equal(signup.error, null);
    assert.equal(
      signup.data.session,
      null,
      "Email confirmation is still required",
    );
    const login = await client.auth.signInWithPassword({
      email: user.email,
      password: "test-password-123",
    });
    assert.equal(login.error, null);
    assert.equal(login.data.user?.id, user.id);
    assert.equal((await control<{ plan: string }>("account")).plan, "free");
    await mockServices.entitlements.change("business");
    assert.equal((await control<{ plan: string }>("account")).plan, "free");
    await control("checkout", { price: "business_monthly" });
    assert.equal(
      (await control<{ plan: string }>("account")).plan,
      "free",
      "Starting Checkout alone does not activate a plan",
    );
    serverPlan = "business"; // Represents the server response after verified webhook reconciliation.
    assert.equal((await control<{ plan: string }>("account")).plan, "business");
    await control("billing");
    await mockServices.auth.logout();
    assert.equal(
      (await client.auth.getSession()).data.session?.user.id,
      user.id,
    );
    await client.auth.signOut();
    await assert.rejects(() => control("account"), /Sign in/);
    assert.ok(requests.some((r) => r.path === "/auth/v1/signup"));
    assert.ok(requests.some((r) => r.path === "/auth/v1/token"));
    assert.ok(
      requests.some(
        (r) =>
          r.path === "/api/control/checkout" &&
          (r.body as { price: string }).price === "business_monthly",
      ),
    );
    assert.throws(() => billingRedirect("https://evil.invalid"), /invalid/);
  } finally {
    accountClient().auth.stopAutoRefresh();
    globalThis.fetch = oldFetch;
    if (oldURL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldURL;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  }
});
