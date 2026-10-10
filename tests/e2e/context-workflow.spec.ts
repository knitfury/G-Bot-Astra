import { test, expect } from "@playwright/test";
import { fixtureRuntime } from "../fixtures/desktop";
import { contextWorkflowFixture } from "../fixtures/context-workflow";
import { validateOperation } from "../../desktop/runtime/ipc";
test("automatic business choices are labeled, remembered, and show Inbox/Sent without AI", async ({
  page,
}) => {
  const f = await fixtureRuntime();
  const { c, mcp, calls } = contextWorkflowFixture({ accounts: 2 });
  c.name = "Connected Mail";
  await f.runtime.services.auth.demo();
  await f.runtime.services.entitlements.change("business");
  f.runtime.db.connections = [c];
  f.runtime.mcp.sources = mcp.sources;
  f.runtime.mcp.call = mcp.call;
  await page.exposeFunction(
    "workflowFixture",
    async (op: unknown, args: unknown) => {
      const request = validateOperation(op, args);
      let value: unknown;
      if (request.operation === "snapshot")
        value = await f.runtime.services.snapshot();
      else if (
        ["desktop.readPreferences", "desktop.savePreferences"].includes(
          request.operation,
        )
      )
        value = null;
      else if (request.operation === "desktop.contextChoice") {
        await f.runtime.snapshots.choose(
          request.args[0] as string,
          request.args[1] as string,
          request.args[2] as string,
        );
        await f.runtime.save();
      } else {
        const [group, method] = request.operation.split(".");
        value = await (f.runtime.services as any)[group][method](
          ...request.args,
        );
      }
      return { ok: true, value };
    },
  );
  await page.addInitScript(() => {
    (window as any).gbot = {
      call: (op: unknown, args: unknown) =>
        (window as any).workflowFixture(op, args),
      subscribe: () => () => {},
    };
  });
  try {
    await page.goto("/workspace");
    const pane = page.getByRole("complementary", {
      name: "left business app pane",
    });
    await expect(pane.getByLabel("Choose Business account")).toBeVisible();
    await expect(pane.getByLabel("Connected Mail context source")).toHaveValue(
      "",
    );
    expect(calls.some((c) => c.name === "listEmails")).toBe(false);
    await pane.getByLabel("Choose Business account").selectOption("1");
    await expect(
      pane.getByText("Email 0", { exact: true }).first(),
    ).toBeVisible();
    await expect(pane.getByLabel("Choose Business account")).toHaveCount(0);
    await pane.getByRole("button", { name: "Sent", exact: true }).click();
    await expect(
      pane.getByText("Email 0", { exact: true }).first(),
    ).toBeVisible();
    await expect(pane.getByLabel("Connected Mail context source")).toHaveValue(
      "",
    );
    await expect(
      pane.getByLabel("Business account", { exact: true }),
    ).toHaveValue("1");
    await pane
      .getByLabel("Business account", { exact: true })
      .selectOption("0");
    await expect(
      pane.getByLabel("Business account", { exact: true }),
    ).toHaveValue("0");
    expect(f.runtime.db.providers).toHaveLength(0);
    expect(
      calls
        .filter((c) => c.name === "listEmails")
        .some((c) => c.args.accountId === "actual-account-1"),
    ).toBe(true);
    await page.reload();
    await expect(
      pane.getByText("Email 0", { exact: true }).first(),
    ).toBeVisible();
    await expect(pane.getByLabel("Choose Business account")).toHaveCount(0);
    await expect(
      pane.getByLabel("Business account", { exact: true }),
    ).toHaveValue("0");
  } finally {
    f.runtime.engine.stopAll();
  }
});
