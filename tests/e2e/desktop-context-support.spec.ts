import { test, expect } from "@playwright/test";
import { fixtureRuntime } from "../fixtures/desktop";
import { validateOperation } from "../../desktop/runtime/ipc";
test("native panes configure read parameters without AI; production cards never switch local entitlement", async ({
  page,
}) => {
  const f = await fixtureRuntime();
  await f.runtime.services.auth.demo();
  await f.runtime.services.entitlements.change("business");
  f.runtime.db.runtime!.production = true;
  const id = await f.runtime.services.connections.save({
    name: "Read-only MCP",
    url: "https://fixture.invalid/mcp",
    category: "Email",
    auth: "None",
    slot: 0,
  });
  await f.runtime.services.connections.connect(id, true);
  await f.runtime.services.tools.toggle(
    id,
    f.runtime.db.connections[0].tools[0].id,
    true,
  );
  const calls: string[] = [];
  await page.exposeFunction(
    "fixtureRequest",
    async (op: unknown, args: unknown) => {
      const r = validateOperation(op, args);
      calls.push(r.operation);
      try {
        let value: unknown;
        if (r.operation === "snapshot")
          value = await f.runtime.services.snapshot();
        else if (r.operation === "desktop.paneResolve")
          value = await f.runtime.snapshots.resolvePane(
            r.args[0] as string,
            r.args[1] as string,
            r.args[2] as Record<string, unknown>,
            r.args[3] as Record<string, string | number | boolean>,
          );
        else if (r.operation === "desktop.readPreferences") value = null;
        else if (
          r.operation === "desktop.savePreferences" ||
          r.operation === "desktop.openAccount"
        )
          value = undefined;
        else if (r.operation === "desktop.paneSources")
          value = await f.runtime.snapshots.sources(r.args[0] as string);
        else if (r.operation === "desktop.configurePane") {
          await f.runtime.snapshots.configure(
            r.args[0] as string,
            r.args[1] as never,
          );
          await f.runtime.save();
        } else {
          const [group, method] = r.operation.split(".");
          value = await (f.runtime.services as any)[group][method](...r.args);
        }
        return { ok: true, value };
      } catch {
        return {
          ok: false,
          error: {
            code: "INVALID_ARGUMENTS",
            message: "Review the selected parameters.",
          },
        };
      }
    },
  );
  await page.addInitScript(() => {
    (window as any).gbot = {
      onBack: (fn: () => void) => {
        window.addEventListener("fixture-back", fn);
        return () => window.removeEventListener("fixture-back", fn);
      },
      call: (op: unknown, args: unknown) =>
        (window as any).fixtureRequest(op, args),
      subscribe: (fn: () => void) => {
        window.addEventListener("fixture-change", fn);
        return () => window.removeEventListener("fixture-change", fn);
      },
    };
  });
  const unsubscribe = f.runtime.services.subscribe(
    () =>
      void page
        .evaluate(() => window.dispatchEvent(new Event("fixture-change")))
        .catch(() => {}),
  );
  try {
    await page.goto("/workspace");
    await expect(
      page.getByText("This source needs", { exact: false }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Configure pane" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("option", { name: /Send response/ }),
    ).toHaveCount(0);
    await expect(dialog.getByText(/Send response:/)).not.toBeVisible();
    await dialog.getByText(/Advanced · blocked operations/).click();
    await expect(dialog.getByText(/Send response:/)).toBeVisible();
    await dialog.getByLabel("Filter operations").fill("absent-operation");
    await expect(dialog.getByText(/Send response:/)).toHaveCount(0);
    await dialog.getByLabel("Filter operations").fill("");
    await dialog
      .getByLabel("Read source", { exact: true })
      .selectOption("tool:read");
    await dialog.getByLabel("query", { exact: true }).fill("recent");
    await dialog.getByLabel("I trust this source", { exact: false }).check();
    await dialog.getByRole("button", { name: "Save pane source" }).click();
    await expect(dialog).not.toBeVisible();
    expect(f.runtime.db.providers).toHaveLength(0);
    await expect.poll(() => f.reads()).toBeGreaterThan(0);
    await page
      .getByRole("link", { name: "Account", exact: true })
      .first()
      .click();
    await expect(page.locator(".plan-card")).toHaveCount(3);
    await expect(page.locator(".plan-card.selected")).toContainText("business");
    await page
      .getByRole("button", { name: "Manage starter in billing" })
      .click();
    expect(calls).toContain("desktop.openAccount");
    expect(calls).not.toContain("entitlements.change");
    await page.getByRole("button", { name: "Back to previous screen" }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await page
      .getByRole("link", { name: "Settings", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "General", exact: true }).click();
    await expect(
      page.getByRole("switch", { name: "Desktop notifications" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Advanced", exact: true }).click();
    await page
      .getByRole("link", { name: "Configure a custom provider" })
      .click();
    await expect(
      page.getByRole("heading", { name: "AI providers", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/providers$/);
    await page.evaluate(() => window.dispatchEvent(new Event("fixture-back")));
    await expect(page).toHaveURL(/section=Advanced/);
    await expect(
      page.getByRole("heading", { name: "Storage & backup" }),
    ).toBeVisible();
  } finally {
    unsubscribe();
    f.runtime.engine.stopAll();
  }
});
