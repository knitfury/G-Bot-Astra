import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { POST as webhook } from "../../src/app/api/stripe/webhook/route";
import { POST as control } from "../../src/app/api/control/[action]/route";
import { POST as maintenance } from "../../src/app/api/maintenance/route";
test("cloud operations reject missing authentication before any privileged work", async () => {
  for (const action of [
    "account",
    "license",
    "checkout",
    "admin-accounts",
    "admin-revoke",
    "admin-refund",
    "delete-account",
  ]) {
    const r = await control(
      new Request("https://account.example/api/control/" + action, {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ action }) },
    );
    assert.equal(r.status, 401, action);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
});
test("Stripe uses exact signed raw body, expiration and environment binding", async () => {
  const names = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NEXT_PUBLIC_GBOT_ENVIRONMENT",
  ] as const;
  const prior = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  const secret = "unit-webhook-only";
  process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.NEXT_PUBLIC_GBOT_ENVIRONMENT = "development";
  try {
    const payload = JSON.stringify({
      id: "evt_fixture",
      object: "event",
      type: "fixture.unsupported",
      livemode: false,
      data: { object: {} },
    });
    const signed = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    const request = (body: string, signature: string) =>
      new Request("https://account.example/api/stripe/webhook", {
        method: "POST",
        body,
        headers: { "stripe-signature": signature },
      });
    assert.equal((await webhook(request(payload, signed))).status, 200);
    assert.equal((await webhook(request(payload + " ", signed))).status, 400);
    assert.equal((await webhook(request(payload, "invalid"))).status, 400);
    assert.equal(
      (
        await webhook(
          request(
            payload,
            Stripe.webhooks.generateTestHeaderString({
              payload,
              secret,
              timestamp: Math.floor(Date.now() / 1000) - 600,
            }),
          ),
        )
      ).status,
      400,
    );
    const live = payload.replace('"livemode":false', '"livemode":true');
    assert.equal(
      (
        await webhook(
          request(
            live,
            Stripe.webhooks.generateTestHeaderString({ payload: live, secret }),
          ),
        )
      ).status,
      400,
    );
  } finally {
    for (const name of names) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
  }
});
test("maintenance requires a strong authenticated scheduler secret", async () => {
  const prior = process.env.GBOT_MAINTENANCE_SECRET;
  process.env.GBOT_MAINTENANCE_SECRET = "x".repeat(40);
  try {
    const r = await maintenance(
      new Request("https://account.example/api/maintenance", {
        method: "POST",
      }),
    );
    assert.equal(r.status, 401);
  } finally {
    if (prior === undefined) delete process.env.GBOT_MAINTENANCE_SECRET;
    else process.env.GBOT_MAINTENANCE_SECRET = prior;
  }
});
