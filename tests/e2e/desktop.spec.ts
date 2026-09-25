import { test, expect } from "@playwright/test";
import { fixtureRuntime } from "../fixtures/desktop";
import { validateOperation } from "../../desktop/runtime/ipc";
import { safeError } from "../../desktop/runtime/errors";
test("desktop contracts: configure, discover, autonomous reads, approvals, recovery and persistence", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const f = await fixtureRuntime();
  let preferences: string | null = null;
  await page.exposeFunction(
    "fixtureRequest",
    async (operation: unknown, args: unknown) => {
      try {
        const r = validateOperation(operation, args);
        let value: unknown;
        if (r.operation === "desktop.readPreferences") value = preferences;
        else if (r.operation === "desktop.savePreferences")
          preferences = r.args[0] as string | null;
        else if (r.operation === "snapshot")
          value = await f.runtime.services.snapshot();
        else {
          const [group, method] = r.operation.split(".");
          const service = f.runtime.services[
            group as keyof typeof f.runtime.services
          ] as unknown as Record<string, (...args: unknown[]) => unknown>;
          value = await service[method](...r.args);
        }
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
    const testWindow = window as unknown as {
      fixtureRequest: (op: unknown, args: unknown) => Promise<unknown>;
      gbot: unknown;
    };
    testWindow.gbot = {
      call: (op: unknown, args: unknown) => testWindow.fixtureRequest(op, args),
      subscribe: (fn: () => void) => {
        window.addEventListener("fixture-change", fn);
        return () => window.removeEventListener("fixture-change", fn);
      },
    };
  });
  const unsubscribe = f.runtime.services.subscribe(() => {
    void page
      .evaluate(() => window.dispatchEvent(new Event("fixture-change")))
      .catch(() => {});
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Open local workspace" }).click();
    await expect(
      page.getByRole("heading", { name: "What can we get done?" }),
    ).toBeVisible();
    await f.runtime.services.entitlements.change("business");
    await page.goto("/providers");
    await page.getByRole("button", { name: "OpenAI", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Connection name").fill("My provider");
    await dialog.locator('input[name="model"]').fill("fixture-model");
    await dialog
      .getByLabel("API key / token (blank keeps saved credential)")
      .fill("fixture-secret");
    await dialog
      .getByRole("button", { name: "Test connection", exact: true })
      .click();
    await expect(
      dialog.getByText("Connection test passed", { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Save provider" }).click();
    await expect(dialog).not.toBeVisible();
    for (const [slot, name] of ["Email", "Inventory"].entries()) {
      await page.goto("/connections");
      await page.getByRole("button", {name:"Add Connection", exact:true}).click();
      await page.getByLabel("Connection name").fill(name);
      await page
        .getByLabel("MCP server URL")
        .fill(`https://${name.toLowerCase()}.example/mcp`);
      await page.getByLabel("Business category").selectOption(name);
      await page.locator('select[name="auth"]').selectOption("Token");
      await page.locator('input[name="token"]').fill("fixture-token");
      await page
        .getByRole("button", { name: "Continue to permissions" })
        .click();
      await page
        .getByLabel("Allow this connection to discover its tools.")
        .check();
      await page
        .getByRole("button", { name: "Connect app", exact: true })
        .click();
      await page.getByRole("button", { name: "Done", exact: true }).click();
      const c = f.runtime.db.connections.find((c) => c.name === name)!;
      expect(c.tools.every((t) => !t.enabled)).toBeTruthy();
      await page.goto(`/connections/${c.id}`);
      await page.getByRole("tab", { name: "Tools", exact: true }).click();
      await page.getByRole("checkbox").first().check();
      if (name === "Email") await page.getByRole("checkbox").nth(1).check();
      await page.screenshot({
        path: info.outputPath(`${name}-permissions.png`),
        animations: "disabled",
      });
    }
    const send = async (text: string) => {
      await page.getByRole("textbox", { name: "Message G-Bot" }).fill(text);
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
    };
    await page.goto("/workspace");
    await send("Read Email and Inventory");
    await expect(
      page.getByText("The customer needs 12 lamps; 24 are available.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(f.reads()).toBe(2);
    expect(f.writes()).toBe(0);
    await page.getByRole("button", { name: "New chat", exact: true }).click();
    await send("Read context and send a response");
    await page
      .getByRole("button", { name: "Approve action", exact: true })
      .waitFor();
    await page.screenshot({
      path: info.outputPath("approval-light.png"),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(
      page.getByText("You rejected the action. No response was sent.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(f.writes()).toBe(0);
    await page.getByRole("button", { name: "New chat", exact: true }).click();
    await send("Read context and send a response");
    await page
      .getByRole("button", { name: "Approve action", exact: true })
      .click();
    await expect(
      page.getByText("Response sent after your approval.", { exact: true }),
    ).toBeVisible();
    expect(f.writes()).toBe(1);
    await page.getByRole("button", { name: "New chat", exact: true }).click();
    f.expire();
    const count = f.reads();
    await send("Read Email and Inventory");
    await page.getByRole("button", { name: "Retry remaining steps" }).waitFor();
    expect(f.reads()).toBe(count + 1);
    await page.screenshot({
      path: info.outputPath("partial-failure.png"),
      animations: "disabled",
    });
    await page.goto(
      `/connections/${f.runtime.db.connections.find((c) => c.name === "Inventory")!.id}`,
    );
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Reconnect|Authorize/ })
      .click();
    await page.goto("/workspace");
    await page.getByRole("button", { name: "Retry remaining steps" }).click();
    await expect(page.getByText(/The customer needs 12 lamps/)).toBeVisible();
    expect(f.reads()).toBe(count + 2);
    for (const [color, appearance, width] of [
      ["orange", "light", 1440],
      ["orange", "dark", 1440],
      ["neutral", "light", 768],
      ["neutral", "dark", 390],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/settings");
      await page.getByRole("radio", { name: color, exact: true }).check();
      await page.getByRole("radio", { name: appearance, exact: true }).check();
      for (const route of [
        "/providers",
        "/connections",
        "/workspace",
        "/activity",
        "/settings",
      ]) {
        await page.goto(route);
        await expect(
          page
            .locator("h1")
            .first()
            .or(page.getByRole("textbox", { name: "Message G-Bot" }))
            .first(),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBeTruthy();
        if (route === "/workspace") {
          await expect
            .poll(() =>
              page.locator(".chat-container").evaluate((el) => {
                const b = el.getBoundingClientRect();
                return b.left >= 0 && b.right <= innerWidth;
              }),
            )
            .toBeTruthy();
        }
        await page.screenshot({
          path: info.outputPath(
            `${color}-${appearance}-${width}-${route.slice(1)}.png`,
          ),
          animations: "disabled",
        });
        if (route === "/providers") {
          await page
            .getByRole("button", { name: "Add provider", exact: true })
            .click();
          await page.getByRole("dialog").waitFor();
          await page.screenshot({
            path: info.outputPath(`${color}-${appearance}-provider-setup.png`),
            animations: "disabled",
          });
          await page.keyboard.press("Escape");
        }
        if (route === "/connections") {
          await page
            .locator(".connection-card")
            .nth(2)
            .getByRole("button", { name: "Connect app", exact: true })
            .click();
          await page.getByLabel("OAuth client ID (optional)").waitFor();
          await page.screenshot({
            path: info.outputPath(`${color}-${appearance}-oauth-setup.png`),
            animations: "disabled",
          });
          await page.locator('select[name="auth"]').selectOption("Token");
          await page.screenshot({
            path: info.outputPath(`${color}-${appearance}-manual-setup.png`),
            animations: "disabled",
          });
          await page.keyboard.press("Escape");
        }
      }
    }
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
    );
    expect(f.runtime.db.conversations.length).toBe(4);
    expect(JSON.stringify(await f.runtime.services.snapshot())).not.toContain(
      "fixture-secret",
    );
    await page.getByRole("button", { name: "About", exact: true }).click();
    await page
      .getByRole("button", { name: "Check for updates", exact: true })
      .click();
    await expect(page.getByText("up to date", { exact: true })).toBeVisible();
    for (const state of [
      "available",
      "downloading",
      "restart required",
      "failed",
    ] as const) {
      f.runtime.db.updateStatus = state;
      f.runtime.db.runtime!.updateError =
        state === "failed"
          ? "Update failed. Check release hosting and try again."
          : undefined;
      await f.runtime.save();
      await expect(page.getByText(state, { exact: true })).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`update-${state.replaceAll(" ", "-")}.png`),
        animations: "disabled",
      });
    }
  } finally {
    unsubscribe();
  }
});
