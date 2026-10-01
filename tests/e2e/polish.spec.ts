import { test, expect } from "@playwright/test";
test("plan comparisons, router Auto choices, Free lock and Business audit coexist with normal Activity", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "What can we get done?" }),
  ).toBeVisible();
  await page.goto("/account");
  const comparison = page.locator(".plan-comparison");
  await expect(comparison).toContainText("$6/month · $60/year");
  await expect(comparison).toContainText("$9/month · $90/year");
  await page.goto("/providers");
  await page.getByRole("button", { name: "OpenRouter", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Automatic model routing")).toHaveValue(
    "openrouter/auto",
  );
  await expect(dialog.getByLabel("Automatic model routing")).toHaveAttribute(
    "readonly",
    "",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "OmniRoute", exact: true }).click();
  await expect(dialog.getByLabel("Automatic model routing")).toHaveValue(
    "auto",
  );
  await page.keyboard.press("Escape");
  await page.goto("/activity");
  await expect(page.getByLabel("Search execution history")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export local audit" }),
  ).toBeVisible();
  await page.goto("/account");
  await page.getByRole("button", { name: "Switch to free" }).click();
  await page.getByRole("button", { name: "Confirm demo plan" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/providers");
  await expect(
    page.getByRole("button", { name: "OpenRouter", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "OmniRoute", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "OpenAI", exact: true }),
  ).toBeEnabled();
  await page.goto("/activity");
  await expect(
    page.getByRole("heading", { name: "Activity", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Application", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Search execution history")).toHaveCount(0);
});
