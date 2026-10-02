import { test, expect } from "@playwright/test";
test("web auth routes and real-account CTAs use the Supabase portal, never local credentials", async ({
  page,
}) => {
  for (const route of [
    "/login",
    "/signup",
    "/login?returnToApp=1&next=https://evil.invalid",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(
      page.getByRole("heading", { name: "Welcome to your workspace." }),
    ).toBeVisible();
    await expect(page.getByText("demo terms", { exact: true })).toHaveCount(0);
    await page
      .getByLabel("Email address", { exact: true })
      .fill("arbitrary@example.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill("arbitrary-password");
    if (route === "/signup") {
      await page.getByRole("button", { name: "Create a Free account" }).click();
      await page
        .getByLabel("Your name", { exact: true })
        .fill("Arbitrary account");
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    } else {
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    }
    await expect(
      page.getByText(/Account services are not configured yet/).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/portal$/);
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("gbot-demo-v1")!).user,
      ),
    ).toBeNull();
  }
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute("href", "/portal");
  await expect(
    page.getByRole("link", { name: "Create account", exact: true }),
  ).toHaveAttribute("href", "/portal");
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/portal$/);
});
test("Demo Business, billing and exit cannot create a real session or entitlement", async ({
  page,
}) => {
  const controls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/control/")) controls.push(r.url());
  });
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
    page.getByRole("link", { name: "Create your workspace" }),
  ).toHaveAttribute("href", "/portal");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute("href", "/portal");
  await page.goto("/account");
  await expect(page.getByText("Demo account · simulated plan")).toBeVisible();
  for (const plan of ["free", "business"]) {
    await page.getByRole("button", { name: `Switch to ${plan}` }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "simulated plan change",
    );
    await page.getByRole("button", { name: "Confirm demo plan" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  await expect(page.getByText("SIMULATED RENEWAL")).toBeVisible();
  await expect(page.locator(".plan-comparison")).toContainText("Price (EUR)");
  for (const price of ["€0", "€6/month", "€60/year", "€9/month", "€90/year"])
    await expect(page.locator(".plan-comparison")).toContainText(price);
  expect(controls).toEqual([]);
  await page.getByRole("link", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Alex Morgan", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Manage plan" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).some((k) => k.includes("auth-token")),
    ),
  ).toBe(false);
  const denied = await page.request.post("/api/control/checkout", {
    data: { plan: "business", price: "business_monthly", user: "demo-user" },
  });
  expect(denied.status()).toBe(401);
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign out & clear credentials" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/portal$/);
});
test("legacy arbitrary browser profiles cannot open application screens as real users", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page).toHaveURL(/workspace/);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("gbot-demo-v1")!);
    db.user = {
      ...db.user,
      id: "legacy-fake-login",
      email: "random@example.invalid",
    };
    db.runtime = { production: true, mode: "desktop" };
    localStorage.setItem("gbot-demo-v1", JSON.stringify(db));
  });
  for (const route of [
    "/workspace",
    "/account",
    "/onboarding",
    "/connections",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByText("Alex Morgan", { exact: true })).toHaveCount(0);
  }
});
