import { test, expect } from "@playwright/test";

for (const [legacy, color, appearance] of [
  ["orange", "orange", "light"],
  ["purple", "purple", "dark"],
  ["blue", "blue", "light"],
  ["green", "green", "light"],
  ["white", "neutral", "light"],
  ["dark", "neutral", "dark"],
])
  test(`saved ${legacy} theme migrates in the browser`, async ({ page }) => {
    await page.addInitScript((theme) => {
      if (!localStorage.getItem("gbot-workspace-v1"))
        localStorage.setItem(
          "gbot-workspace-v1",
          JSON.stringify({
            state: {
              theme,
              drafts: { saved: "Keep my draft" },
              reducedMotion: true,
            },
            version: 0,
          }),
        );
    }, legacy);
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-color", color);
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      appearance,
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      appearance,
    );
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gbot-workspace-v1")!),
    );
    expect(stored.version).toBe(1);
    expect(stored.state.drafts.saved).toBe("Keep my draft");
    expect(stored.state.theme).toBeUndefined();
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion",
      "reduced",
    );
  });

for (const color of ["orange", "purple", "blue", "green", "neutral"])
  test(`${color} dark covers workflows and supporting surfaces`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      (color) =>
        localStorage.setItem(
          "gbot-workspace-v1",
          JSON.stringify({
            state: { color, appearance: "dark", reducedMotion: true },
            version: 1,
          }),
        ),
      color,
    );
    const capture = async (name: string) => {
      await expect(page.locator("html")).toHaveAttribute("data-color", color);
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        "dark",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      // Every visible UI surface must inherit the dark semantic palette.
      await expect
        .poll(
          () =>
            page
              .locator(
                ".panel, .dialog-content, .composer, .connection-card, input, textarea, select",
              )
              .evaluateAll((elements) =>
                elements
                  .filter((e) => {
                    if (!(e as HTMLElement).offsetParent) return false;
                    const rgb =
                      getComputedStyle(e)
                        .backgroundColor.match(/[\d.]+/g)
                        ?.map(Number) ?? [];
                    return (
                      rgb.length >= 3 &&
                      (rgb.length < 4 || rgb[3] > 0.5) &&
                      rgb.slice(0, 3).every((v) => v > 210)
                    );
                  })
                  .map((e) => e.className),
              ),
          { message: "Visible surfaces settle on the persisted dark palette" },
        )
        .toEqual([]);
      await page.screenshot({
        animations: "disabled",
        path: info.outputPath(`${color}-${name}.png`),
      });
    };
    for (const route of ["login", "signup"]) {
      await page.goto(`/${route}`);
      await expect(page.locator("h1")).toBeVisible();
      await capture(route);
    }
    await page.goto("/");
    await page.getByRole("button", { name: "Explore the demo" }).click();
    await page.locator(".record-detail").first().waitFor();
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name: "order.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Order DS-1042"),
      });
    await page
      .getByRole("textbox", { name: "Message G-Bot" })
      .fill("Find Maya's latest email, check stock and send a response.");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await page.getByRole("button", { name: "Approve & send" }).waitFor();
    await capture("approval");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await capture("approval-edit");
    await page.getByRole("button", { name: "Conversation history" }).click();
    await capture("history");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "G-Bot only mode" }).click();
    await capture("gbot-only");
    for (const route of [
      "connections",
      "connections/app-0",
      "providers",
      "activity",
      "account",
      "settings",
      "onboarding",
    ]) {
      await page.goto(`/${route}`);
      await expect(page.locator("h1")).toBeVisible();
      await capture(route.replaceAll("/", "-"));
    }
    await page.goto("/providers");
    await page
      .getByRole("button", { name: "Generic REST", exact: true })
      .click();
    await capture("provider-dialog");
    await page
      .getByRole("dialog")
      .getByLabel("Connection name")
      .fill("Theme check");
    await page
      .getByRole("dialog")
      .getByLabel("Demo API key / token")
      .fill("demo-key-1234");
    await page
      .getByRole("dialog")
      .getByLabel("Request-body template")
      .fill("{bad");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Test connection", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await capture("provider-error");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspace");
    await page.getByRole("button", { name: "Toggle left pane" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture("mobile-sheet");
    expect(errors).toEqual([]);
  });
