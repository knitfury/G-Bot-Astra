import { test, expect } from "@playwright/test";
import { fixtureRuntime } from "../fixtures/desktop";
import { ProductionIdentity } from "../../desktop/runtime/identity";
import { safeError } from "../../desktop/runtime/errors";
import { validateOperation } from "../../desktop/runtime/ipc";
test("production Welcome, distinct auth routes, safe OAuth, session routing and sign-out", async ({
  page,
}) => {
  const { runtime } = await fixtureRuntime();
  runtime.db.runtime!.production = true;
  const identity = new ProductionIdentity(
    runtime.vault,
    {
      supabaseUrl: "",
      anonKey: "",
      controlOrigin: "https://account.example",
      environment: "development",
      publicKeys: {},
      version: "1.0.0",
      platform: "win32",
    },
    async () => {
      throw Error("Unconfigured OAuth must not launch");
    },
    async () => {},
  );
  let prefs: string | null = null;
  await page.exposeFunction(
    "launchCall",
    async (operation: unknown, args: unknown) => {
      try {
        const r = validateOperation(operation, args);
        let value: unknown;
        if (r.operation === "snapshot")
          value = await runtime.services.snapshot();
        else if (r.operation === "desktop.readPreferences") value = prefs;
        else if (r.operation === "desktop.savePreferences")
          prefs = r.args[0] as string;
        else if (r.operation === "desktop.signIn")
          value = await identity.browser(r.args[0] as "google" | "azure");
        else if (r.operation === "auth.logout")
          value = await runtime.services.auth.logout();
        else throw Error("Unexpected fixture operation");
        return { ok: true, value };
      } catch (e) {
        const error = safeError(e);
        return {
          ok: false,
          error: { code: error.code, message: error.message },
        };
      }
    },
  );
  await page.addInitScript(() => {
    const w = window as unknown as {
      launchCall: (op: unknown, args: unknown) => Promise<unknown>;
      gbot: unknown;
    };
    w.gbot = {
      call: (op: unknown, args: unknown) => w.launchCall(op, args),
      subscribe: () => () => {},
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Meet your new way to work." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /One conversation/ }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  for (const provider of ["Google", "Microsoft"]) {
    await page.getByRole("button", { name: provider, exact: true }).click();
    await expect(page.locator(".error-state[role=alert]")).toContainText(
      `${provider} sign-in isn't configured for this environment yet.`,
    );
    await expect(page.locator("body")).not.toContainText("SUPABASE");
  }
  await page.getByRole("link", { name: /Back to Welcome/ }).click();
  await page.getByRole("link", { name: /Create account/ }).click();
  await expect(
    page.getByRole("heading", { name: "Create your G-Bot account" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: /Back to Welcome/ }).click();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: "test-results/launch-welcome.png",
    fullPage: true,
  });
  runtime.db.user = {
    id: "fixture-user",
    name: "Fixture",
    email: "fixture@example.invalid",
    avatar: "",
    status: "active",
    createdAt: new Date().toISOString(),
  };
  runtime.db.entitlement.status = "active";
  await page.goto("/");
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(
    page.getByRole("heading", { name: "What can we get done?" }),
  ).toBeVisible();
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Meet your new way to work." }),
  ).toBeVisible();
});
test("Demo has fictional data, no live actions, conversion and an exit", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "What can we get done?" }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Demo Mode · Fictional data · No live actions", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create your workspace", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Phase 1");
  await expect(page.locator("body")).not.toContainText("demo keys");
  await page.getByRole("link", { name: "Exit Demo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meet your new way to work." }),
  ).toBeVisible();
});
