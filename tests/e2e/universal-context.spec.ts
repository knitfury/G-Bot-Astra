import { test, expect } from "@playwright/test";
import { fixtureRuntime } from "../fixtures/desktop";
import { contextConnection, contexts } from "../fixtures/context";
import { validateOperation } from "../../desktop/runtime/ipc";
test("different MCP contexts populate both panes without AI, including unknown data, refresh and safe switching", async ({
  page,
}) => {
  const f = await fixtureRuntime();
  await f.runtime.services.auth.demo();
  await f.runtime.services.entitlements.change("business");
  const ids = [
    "mail",
    "inventory",
    "crm",
    "calendar",
    "unknown",
    "dangerous",
    "required",
    "disabled",
  ];
  f.runtime.db.connections = ids.map((id, slot) => ({
    ...contextConnection(id, `Fixture ${id}`),
    slot,
  }));
  f.runtime.db.connections[3].tools = [];
  f.runtime.db.connections[5].tools[0].annotations = {};
  f.runtime.db.connections[5].tools[0].description =
    "Safe inbox read, execute now";
  f.runtime.db.connections[6].tools[0].inputSchema = {
    type: "object",
    required: ["projectId"],
    properties: { projectId: { type: "string", title: "Project" } },
  };
  f.runtime.db.connections[0].tools.push({
    ...f.runtime.db.connections[0].tools[0],
    id: "mail:contacts",
    name: "contacts_overview",
    label: "Contacts",
  });
  f.runtime.db.connections[0].tools.push({
    ...f.runtime.db.connections[0].tools[0],
    id: "mail:status",
    name: "status_overview",
    label: "Status list",
  });
  f.runtime.db.connections[7].tools[0].enabled = false;
  f.runtime.db.connections[7].tools.push({
    ...f.runtime.db.connections[7].tools[0],
    id: "disabled:delete",
    name: "delete_email",
    label: "Delete mail",
  });
  const calls: Record<string, number> = {};
  f.runtime.mcp.sources = async (c) =>
    c.id === "calendar"
      ? [
          {
            source: "resource",
            name: "calendar://upcoming",
            label: "Upcoming events",
            binding: "r1",
            eligible: true,
            reason: "Readable resource",
          },
        ]
      : [];
  f.runtime.mcp.readResource = async () => JSON.stringify(contexts.calendar);
  f.runtime.mcp.call = async (c, t) => {
    calls[c.id] = (calls[c.id] ?? 0) + 1;
    if (t.name === "status_overview")
      return JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              data: { status: { code: 200, description: "success" } },
            }),
          },
        ],
      });
    if (t.name === "contacts_overview")
      return JSON.stringify({ contacts: [{ name: "Contact Alice" }] });
    return JSON.stringify(
      c.id === "required"
        ? contexts.crm
        : contexts[c.id as keyof typeof contexts],
    );
  };
  await page.exposeFunction(
    "contextFixture",
    async (op: unknown, args: unknown) => {
      const r = validateOperation(op, args);
      let value: unknown;
      if (r.operation === "snapshot")
        value = await f.runtime.services.snapshot();
      else if (r.operation === "desktop.readPreferences") value = null;
      else if (r.operation === "desktop.savePreferences") value = undefined;
      else if (r.operation === "desktop.paneSources")
        value = await f.runtime.snapshots.sources(r.args[0] as string);
      else if (r.operation === "desktop.configurePane")
        await f.runtime.snapshots.configure(
          r.args[0] as string,
          r.args[1] as never,
        );
      else {
        const [g, m] = r.operation.split(".");
        value = await (f.runtime.services as any)[g][m](...r.args);
      }
      return { ok: true, value };
    },
  );
  await page.addInitScript(() => {
    (window as any).gbot = {
      call: (op: unknown, args: unknown) =>
        (window as any).contextFixture(op, args),
      subscribe: () => () => {},
    };
  });
  try {
    await page.goto("/workspace");
    const left = page.getByRole("complementary", {
        name: "left business app pane",
      }),
      right = page.getByRole("complementary", {
        name: "right business app pane",
      });
    await expect(
      left.getByText("Quote request", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      right.getByText("Desk lamp", { exact: true }).first(),
    ).toBeVisible();
    expect(f.runtime.db.providers).toHaveLength(0);
    await expect(left.getByLabel("Fixture mail context source")).toHaveValue(
      "",
    );
    await expect(
      left.getByText("data status code", { exact: true }),
    ).toHaveCount(0);
    await left
      .getByLabel("Fixture mail context source")
      .selectOption("tool:status_overview");
    await expect(left.getByText(/only API status information/)).toBeVisible();
    await expect(left.getByText("200", { exact: true })).toHaveCount(0);
    await expect(left.getByLabel("Fixture mail context source")).toHaveValue(
      "tool:status_overview",
    );
    await left.getByLabel("Fixture mail context source").selectOption("");
    await expect(
      left.getByText("Quote request", { exact: true }).first(),
    ).toBeVisible();
    const before = calls.mail;
    await left
      .getByRole("button", { name: "Refresh Fixture mail snapshot" })
      .click();
    await expect.poll(() => calls.mail).toBeGreaterThan(before);
    await left
      .getByLabel("Fixture mail context source")
      .selectOption("tool:contacts_overview");
    await expect(
      left.getByText("Contact Alice", { exact: true }).first(),
    ).toBeVisible();
    await expect(left.getByLabel("Fixture mail context source")).toHaveValue(
      "tool:contacts_overview",
    );
    await left
      .getByRole("button", { name: "Refresh Fixture mail snapshot" })
      .click();
    await expect(left.getByLabel("Fixture mail context source")).toHaveValue(
      "tool:contacts_overview",
    );
    await left.getByLabel("Fixture mail context source").selectOption("");
    await expect(
      left.getByText("Quote request", { exact: true }).first(),
    ).toBeVisible();
    await expect(left.getByLabel("Fixture mail context source")).toHaveValue(
      "",
    );
    await left
      .getByRole("button", { name: "Refresh Fixture mail snapshot" })
      .click();
    await expect(left.getByLabel("Fixture mail context source")).toHaveValue(
      "",
    );
    for (const [id, text] of [
      ["crm", "New lead"],
      ["calendar", "Customer meeting"],
      ["unknown", "Alpha"],
    ]) {
      await page.getByLabel("left pane app", { exact: true }).selectOption(id);
      await expect(left.getByText(text, { exact: true }).first()).toBeVisible();
      await expect(
        right.getByText("Desk lamp", { exact: true }).first(),
      ).toBeVisible();
    }
    await expect(left.getByRole("table")).toBeVisible();
    await page
      .getByLabel("left pane app", { exact: true })
      .selectOption("dangerous");
    await expect(left.getByText(/No safely readable context/)).toBeVisible();
    expect(calls.dangerous ?? 0).toBe(0);
    await page
      .getByLabel("left pane app", { exact: true })
      .selectOption("required");
    await expect(left.getByText(/This source needs projectId/)).toBeVisible();
    expect(calls.required ?? 0).toBe(0);
    await left.getByRole("button", { name: "Configure pane" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Read source", { exact: true })
      .selectOption("tool:opaque_operation");
    await expect(
      dialog.getByLabel("Parameters (JSON)", { exact: false }),
    ).not.toBeVisible();
    await dialog.getByLabel("Project", { exact: true }).fill("chosen-project");
    await dialog.getByLabel("I trust this source", { exact: false }).check();
    await dialog.getByRole("button", { name: "Save pane source" }).click();
    await expect(
      left.getByText("New lead", { exact: true }).first(),
    ).toBeVisible();
    await page
      .getByLabel("left pane app", { exact: true })
      .selectOption("disabled");
    await expect(left.getByText(/Open Your Connections/)).toBeVisible();
    await expect(
      left.getByText("Overview (opaque_operation)", { exact: true }),
    ).toBeVisible();
    await expect(
      left.getByText("Delete mail (delete_email)", { exact: true }),
    ).toHaveCount(0);
    expect(calls.disabled ?? 0).toBe(0);
    await left
      .getByRole("link", { name: "Enable verified read-only tools" })
      .click();
    await expect(page).toHaveURL(/connections\/disabled\?section=Tools$/);
    await expect(
      page.getByRole("tab", { name: "Tools", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "Discovered tools", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 900, height: 900 });
    expect(calls.dangerous ?? 0).toBe(0);
  } finally {
    f.runtime.engine.stopAll();
  }
});
