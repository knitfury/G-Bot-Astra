import { test, expect } from "@playwright/test";
test("public product, account and admin surfaces work without claiming unconfigured services", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const response = await page.goto("/g-bot");
    expect(response?.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    await page.locator('html[data-app-ready="true"]').waitFor();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("$6", { exact: false }).first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/phase3-product-${width}.png`,
      fullPage: true,
    });
    for (const route of [
      "/portal",
      "/admin",
      "/g-bot/downloads",
      "/g-bot/privacy",
      "/g-bot/status",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
  }
  expect(errors).toEqual([]);
});
