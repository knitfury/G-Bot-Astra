import { test, expect } from "@playwright/test";
test("Demo examples never become saved connections; inactive duplicate providers persist", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "What can we get done?" }),
  ).toBeVisible();
  await page.goto("/connections");
  await expect(page.locator(".connection-summary")).toContainText("0 of 8");
  await expect(page.locator(".connection-card")).toHaveCount(0);
  await expect(page.locator(".empty-state")).toBeVisible();
  for (const name of ["Work email", "Other email"]) {
    await page
      .getByRole("button", { name: "Add Connection", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("tab", { name: "G-Bot Recommended" }),
    ).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "Custom MCP" })).toBeVisible();
    await dialog.getByLabel("Connection name").fill(name);
    await dialog.getByLabel("MCP server URL").fill("https://mail.example/mcp");
    await dialog
      .getByRole("button", { name: "Continue to permissions" })
      .click();
    await expect(
      dialog.getByLabel("Allow this connection to discover its tools."),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.reload();
  await expect(page.locator(".connection-card")).toHaveCount(2);
  await expect(page.locator(".connection-summary")).toContainText("0 of 8");
  for (const plan of ["free", "starter", "business"]) {
    await page.goto("/account");
    await page
      .getByRole("button", { name: `Switch to ${plan}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm demo plan" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.goto("/connections");
    await expect(page.locator(".connection-card")).toHaveCount(2);
  }
});
test("Advanced and unrelated preferences survive rehydration and Demo reentry", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "What can we get done?" }),
  ).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.context().setOffline(true);
  await page.getByRole("switch", { name: "Desktop notifications" }).uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("gbot-demo-v1")!).preferences.notifications)).toBe(false);
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("radio", { name: "purple", exact: true }).check();
  await page.getByRole("switch", { name: "Reduce motion" }).check();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  for (const name of [
    "Inventory unavailable",
    "Tool execution failure",
    "Provider authentication failure",
    "OAuth consent failure",
    "No tools discovered",
  ])
    await page.getByRole("switch", { name, exact: true }).check();
  await page.getByLabel("Next sign-in failure").selectOption("network");
  // Re-entering /demo previously reset the whole database.
  await page.goto("/demo");
  await expect(page).toHaveURL(/workspace/);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  for (const name of [
    "Inventory unavailable",
    "Tool execution failure",
    "Provider authentication failure",
    "OAuth consent failure",
    "No tools discovered",
  ])
    await expect(page.getByRole("switch", { name, exact: true })).toBeChecked();
  await expect(page.getByLabel("Next sign-in failure")).toHaveValue("network");
  await page.getByRole("button", { name: "General", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Desktop notifications" }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "purple", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Reduce motion" }),
  ).toBeChecked();
});
test("business content roles gain exactly one pixel; other panel text stays unchanged at both breakpoints", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.locator(".left .record-detail")).toBeVisible();
  for (const width of [1440, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    const before = await page
      .locator(".business-pane")
      .evaluateAll((panes) =>
        panes.flatMap((p) =>
          [
            ...p.querySelectorAll(
              "strong, p, h3, .badge, .eyebrow, .stock-number, .pane-footer",
            ),
          ].map((e) => ({
            role: e.classList.contains("context-content"),
            size: parseFloat(getComputedStyle(e).fontSize),
          })),
        ),
      );
    await page
      .locator(".context-content")
      .evaluateAll((es) =>
        es.forEach((e) =>
          e.classList.replace("context-content", "test-content-baseline"),
        ),
      );
    const after = await page
      .locator(".business-pane")
      .evaluateAll((panes) =>
        panes.flatMap((p) =>
          [
            ...p.querySelectorAll(
              "strong, p, h3, .badge, .eyebrow, .stock-number, .pane-footer",
            ),
          ].map((e) => parseFloat(getComputedStyle(e).fontSize)),
        ),
      );
    expect(before.filter((v) => v.role).length).toBeGreaterThan(8);
    before.forEach((v, i) => expect(v.size - after[i]).toBe(v.role ? 1 : 0));
    await page
      .locator(".test-content-baseline")
      .evaluateAll((es) =>
        es.forEach((e) =>
          e.classList.replace("test-content-baseline", "context-content"),
        ),
      );
    await expect(page.locator(".left .record-detail h3")).not.toHaveClass(
      /context-content/,
    );
    await expect(page.locator(".right .record-detail h3")).toHaveClass(
      /context-content/,
    );
  }
});
