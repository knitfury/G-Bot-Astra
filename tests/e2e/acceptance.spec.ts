import { test, expect, type Page } from "@playwright/test";
async function demo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await expect(
    page.getByRole("heading", { name: "What can we get done?" }),
  ).toBeVisible();
  await page.locator(".record-detail").first().waitFor();
}
async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Message G-Bot" }).fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
}
async function settings(page: Page, section: string) {
  await page.goto("/settings");
  await page.getByRole("button", { name: section, exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
}
test("signup → entitlement → AI → business app → workspace", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Jordan Ellis");
  await page.getByLabel("Email address").fill("jordan@studio.example");
  await page.getByLabel("Password", { exact: true }).fill("demo-pass-123");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/onboarding/);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "OpenAI", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Connection name").fill("My OpenAI");
  await dialog.getByLabel("Demo API key / token").fill("demo-key-1234");
  await dialog
    .getByRole("button", { name: "Test connection", exact: true })
    .click();
  await expect(
    dialog.getByText("Connection test passed · simulated"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Save provider" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Connect app", exact: true }).click();
  await page.getByLabel("Connection name").fill("Business Mail");
  await page.getByRole("button", { name: "Continue to permissions" }).click();
  await page.getByLabel("Allow this connection to discover its tools.").check();
  await page.getByRole("button", { name: "Authorize demo connection" }).click();
  await expect(page.getByText("Business Mail is connected.")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page).toHaveURL(/workspace/);
  await expect(page.getByRole("combobox", { name: "AI model" })).toContainText(
    "demo-model",
  );
  await page.goto("/connections");
  await expect(page.locator(".connection-card")).toHaveCount(8);
  await expect(page.locator(".connection-card.locked")).toHaveCount(7);
});
test("signature scenario, edited approval, feedback, history and activity", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await demo(page);
  await send(
    page,
    "Find Maya's latest email, check stock, and prepare a response.",
  );
  await expect(
    page.getByRole("heading", { name: "Available and ready for your reply" }),
  ).toBeVisible();
  await expect(page.locator(".markdown")).toContainText(["24 in stock"]);
  await page.getByRole("button", { name: "Send this response" }).click();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Action approval" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Your Arc Desk Lamps are available");
  await page.getByRole("button", { name: "Approve & send" }).click();
  await expect(
    page
      .getByText("Email sent in the simulation. No real email was delivered.", {
        exact: false,
      })
      .last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Helpful response" }).last().click();
  await expect(
    page.getByRole("button", { name: "Helpful response" }).last(),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: info.outputPath("signature-result.png") });
  await page.getByRole("button", { name: "Conversation history" }).click();
  await page.getByRole("button", { name: /Rename Find Maya/ }).click();
  await page
    .getByLabel("Conversation title")
    .fill("Maya stock and approved reply");
  await page.getByRole("button", { name: "Save title" }).click();
  await page.keyboard.press("Escape");
  await page.goto("/activity");
  await expect(
    page.getByRole("heading", { name: "Send customer email", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await noOverflow(page);
});
test("support approval rejection and cross-app partial failure recovery", async ({
  page,
}, info) => {
  await demo(page);
  await send(
    page,
    "Summarize Leo at Northwind's issue and create a support ticket.",
  );
  await expect(
    page.getByRole("button", { name: "Approve & create ticket" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(
    page
      .getByText("You rejected this action. Nothing was sent or created.", {
        exact: false,
      })
      .last(),
  ).toBeVisible();
  await settings(page, "Advanced");
  await page
    .getByRole("switch", { name: "Inventory unavailable", exact: true })
    .check();
  await page.goto("/workspace");
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await send(page, "Find Maya's latest email and check inventory.");
  await expect(page.getByText("Task paused.", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("partial-failure.png") });
  await settings(page, "Advanced");
  await page
    .getByRole("switch", { name: "Inventory unavailable", exact: true })
    .uncheck();
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Retry remaining steps" }).click();
  await expect(
    page.getByRole("heading", { name: "Available and ready for your reply" }),
  ).toBeVisible();
  await expect(page.locator(".tool-call.completed")).toHaveCount(2);
});
test("downgrade retains eight configurations and limits execution", async ({
  page,
}, info) => {
  await demo(page);
  await page.goto("/account");
  await page.getByRole("button", { name: "Switch to starter" }).click();
  await page.getByRole("button", { name: "Confirm demo plan" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/connections");
  await expect(page.locator(".connection-card")).toHaveCount(8);
  await expect(page.locator(".connection-card.locked")).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("starter-connections.png") });
  await page.goto("/account");
  await page.getByRole("button", { name: "Switch to free" }).click();
  await page.getByRole("button", { name: "Confirm demo plan" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/connections");
  await expect(page.locator(".connection-card.locked")).toHaveCount(7);
  await page.goto("/account");
  await page.getByRole("button", { name: "Switch to business" }).click();
  await page.getByRole("button", { name: "Confirm demo plan" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/connections");
  await expect(page.locator(".connection-card.locked")).toHaveCount(0);
});
test("pane switching, resizing, persistence, G-Bot-only and narrow context", async ({
  page,
}, info) => {
  await demo(page);
  await page.getByLabel("left pane app", { exact: true }).selectOption("app-1");
  await expect(page.locator(".left .record-detail")).toContainText(
    "Maya Dawson",
  );
  await page.getByRole("separator", { name: "Resize left pane" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("separator", { name: "Resize left pane" }),
  ).toHaveAttribute("aria-valuenow", "290");
  await page
    .getByRole("button", { name: "Close right pane", exact: true })
    .click();
  await expect(page.locator(".business-pane.right")).toHaveCount(0);
  await page.getByRole("button", { name: "G-Bot only mode" }).click();
  await expect(page.locator(".business-pane")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".business-pane")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("gbot-only.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle left pane" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel("left pane app", { exact: true })
    .selectOption("app-0");
  await page.screenshot({ path: info.outputPath("mobile-context.png") });
  await page.keyboard.press("Escape");
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("mobile-workspace.png") });
});
test("all ten themes, settings, routes and responsive layouts", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await demo(page);
  for (const color of ["orange", "purple", "blue", "green", "neutral"]) {
    for (const appearance of ["light", "dark"]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await settings(page, "Appearance");
      await page.getByRole("radio", { name: color, exact: true }).check();
      await page.getByRole("radio", { name: appearance, exact: true }).check();
      await expect(page.locator("html")).toHaveAttribute("data-color", color);
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        appearance,
      );
      await page.screenshot({
        path: info.outputPath(`${color}-${appearance}-settings.png`),
      });
      await page.goto("/workspace");
      await expect(
        page.getByRole("heading", { name: "What can we get done?" }),
      ).toBeVisible();
      await page.locator(".record-detail").first().waitFor();
      await expect(page.locator("html")).toHaveAttribute("data-color", color);
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        appearance,
      );
      for (const [width, height] of [
        [1440, 1000],
        [768, 1024],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await noOverflow(page);
        await page.screenshot({
          path: info.outputPath(
            `${color}-${appearance}-workspace-${width}.png`,
          ),
        });
      }
    }
  }
  await settings(page, "Appearance");
  await page
    .getByRole("switch", { name: "Reduce motion", exact: true })
    .check();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  for (const route of [
    "/connections",
    "/providers",
    "/activity",
    "/account",
    "/settings",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/workspace");
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("tablet-workspace.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/connections",
    "/providers",
    "/activity",
    "/account",
    "/settings",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`mobile-${route.slice(1)}.png`),
    });
  }
});
test("custom REST validation, coexistence, model switching and removal", async ({
  page,
}) => {
  await demo(page);
  await page.goto("/providers");
  await page.getByRole("button", { name: "Generic REST", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Connection name").fill("Local inference");
  await d.getByLabel("Demo API key / token").fill("demo-key-1234");
  await d.getByLabel("Request-body template").fill("invalid-json");
  await d.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("JSON");
  await d.getByLabel("Request-body template").fill('{"prompt":"{{input}}"}');
  await d.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(d.getByText("Connection test passed · simulated")).toBeVisible();
  await d.getByRole("button", { name: "Save provider" }).click();
  await expect(d).not.toBeVisible();
  await expect(page.locator(".provider-card")).toHaveCount(2);
  await expect(page.locator("body")).not.toContainText("demo-key-1234");
  await page.goto("/workspace");
  await page
    .getByLabel("AI model", { exact: true })
    .selectOption({ label: "demo-model · Local inference" });
  await page.goto("/providers");
  await page
    .getByRole("button", { name: "Remove Local inference", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove provider", exact: true })
    .click();
  await expect(page.locator(".provider-card")).toHaveCount(1);
});
test("file, image, URL attachments and unsupported file recovery", async ({
  page,
}, info) => {
  await demo(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "order.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Order DS-1042"),
    });
  await expect(page.locator(".attachment-chip")).toContainText("ready");
  await page.getByRole("button", { name: "Attach URL" }).click();
  await page
    .getByRole("textbox", { name: "URL", exact: true })
    .fill("https://example.com/product");
  await page.getByRole("button", { name: "Attach link", exact: true }).click();
  await expect(page.locator(".attachment-chip")).toHaveCount(2);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "unsafe.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("mock"),
    });
  await expect(page.locator(".attachment-chip.invalid")).toBeVisible();
  await page.getByRole("button", { name: "Remove unsafe.exe" }).click();
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "sample.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3p8AAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.locator(".attachment-chip img")).toBeVisible();
  await page.screenshot({ path: info.outputPath("attachments.png") });
  await send(page, "Check Maya stock using the demo scenario.");
  await expect(
    page.getByRole("heading", { name: "Available and ready for your reply" }),
  ).toBeVisible();
  await expect(page.locator(".message.user .attachment-chip")).toHaveCount(3);
});
test("connection permission changes and reconnect failure recover", async ({
  page,
}) => {
  await demo(page);
  await page.goto("/connections/app-0");
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page
    .getByLabel("Enable Find customer emails", { exact: true })
    .uncheck();
  await expect(
    page.getByLabel("Enable Find customer emails", { exact: true }),
  ).toBeEnabled();
  await page.goto("/workspace");
  await send(page, "Check Maya's email and stock.");
  await expect(page.getByText("Task paused.", { exact: true })).toBeVisible();
  await page.goto("/connections/app-0");
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page.getByLabel("Enable Find customer emails", { exact: true }).check();
  await expect(
    page.getByLabel("Enable Find customer emails", { exact: true }),
  ).toBeEnabled();
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Retry remaining steps" }).click();
  await expect(
    page.getByRole("heading", { name: "Available and ready for your reply" }),
  ).toBeVisible();
  await settings(page, "Advanced");
  await page
    .getByRole("switch", { name: "OAuth consent failure", exact: true })
    .check();
  await page.goto("/connections/app-0");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await page.getByRole("button", { name: "Authorize demo connection" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Connection failed",
  );
  await page.keyboard.press("Escape");
  await settings(page, "Advanced");
  await page
    .getByRole("switch", { name: "OAuth consent failure", exact: true })
    .uncheck();
  await page.goto("/connections/app-0");
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await page.getByRole("button", { name: "Authorize demo connection" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".page-heading .badge")).toContainText("connected");
});
