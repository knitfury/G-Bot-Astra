import { test, expect } from "@playwright/test";
import { fixtureRuntime } from "../fixtures/desktop";
import { validateOperation } from "../../desktop/runtime/ipc";
import { mkdir } from "node:fs/promises";
test("business snapshots, bulk permissions, wrapped identifiers and restored settings", async ({
  page,
}) => {
  const f = await fixtureRuntime();
  await f.runtime.services.auth.demo();
  await f.runtime.services.entitlements.change("business");
  const id = await f.runtime.services.connections.save({
    name: "Customer Mail",
    category: "Email",
    slot: 0,
    url: "https://mail.example/mcp",
    auth: "None",
  });
  await f.runtime.services.connections.connect(id, true);
  const c = f.runtime.db.connections[0];
  c.tools[0] = {
    ...c.tools[0],
    name: "list_emails",
    label: "Read " + "BusinessContext".repeat(35),
    inputSchema: { type: "object", properties: {} },
    enabled: true,
  };
  f.runtime.mcp.call = async () =>
    JSON.stringify({
      messages: [
        {
          id: "message-1",
          subject: "Stock request for ARC lamps",
          sender: "Maya at Studio",
          preview: "Please check 12 lamps.",
          status: "Unread",
        },
        {
          id: "message-2",
          subject: "LongBusinessValue".repeat(60),
          sender: "Customer",
          preview: "Long content remains contained.",
        },
      ],
    });
  let preferences: string | null = null;
  await page.exposeFunction(
    "fixtureRequest",
    async (op: unknown, args: unknown) => {
      try {
        const r = validateOperation(op, args);
        let value: unknown;
        if (r.operation === "desktop.readPreferences") value = preferences;
        else if (r.operation === "desktop.savePreferences")
          preferences = r.args[0] as string;
        else if (r.operation === "snapshot")
          value = await f.runtime.services.snapshot();
        else {
          const [group, method] = r.operation.split(".");
          value = await (
            f.runtime.services[
              group as keyof typeof f.runtime.services
            ] as unknown as Record<string, (...a: unknown[]) => unknown>
          )[method](...r.args);
        }
        return { ok: true, value };
      } catch {
        return {
          ok: false,
          error: { code: "TEST", message: "Test request failed" },
        };
      }
    },
  );
  await page.addInitScript(() => {
    const w = window as unknown as {
      fixtureRequest: (o: unknown, a: unknown) => Promise<unknown>;
      gbot: unknown;
    };
    w.gbot = {
      call: (o: unknown, a: unknown) => w.fixtureRequest(o, a),
      subscribe: () => () => {},
    };
  });
  await page.goto("/workspace");
  await expect(
    page.getByText("Stock request for ARC lamps").first(),
  ).toBeVisible();
  await expect(page.getByText("CONNECTED CAPABILITIES")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ask G-Bot about this", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message G-Bot" }),
  ).toHaveValue(/Stock request/);
  await mkdir("docs/screenshots/phase3", { recursive: true });
  for (const width of [240, 280, 360]) {
    await page.getByRole("button", { name: "left pane options" }).click();
    await page
      .getByRole("slider", { name: "left pane width" })
      .fill(String(width));
    await page.getByRole("button", { name: "left pane options" }).click();
    expect(
      await page
        .locator(".business-pane.left")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: "docs/screenshots/phase3/business-snapshots.png",
  });
  await page.goto(`/connections/${id}`);
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await expect(page.getByText("1 of 2 enabled")).toBeVisible();
  await page.getByRole("button", { name: "Select All", exact: true }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await expect(page.getByText("2 of 2 enabled")).toBeVisible();
  expect(c.tools[1].requiresApproval).toBeTruthy();
  await page.getByRole("button", { name: "Deselect All", exact: true }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await expect(page.getByText("0 of 2 enabled")).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.goto("/settings");
  await page.getByRole("radio", { name: "neutral", exact: true }).check();
  await page.getByRole("radio", { name: "dark", exact: true }).check();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Local data controls" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Custom integrations" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/phase3/advanced-neutral-dark.png",
  });
  await page
    .getByRole("button", { name: "Security & Privacy", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Show activity history" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByText("Stable channel")).toBeVisible();
  await expect(page.getByText(/Vidinex E-Commerce/)).toBeVisible();
});
