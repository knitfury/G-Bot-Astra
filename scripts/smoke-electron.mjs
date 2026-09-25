import { _electron as electron } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { execFileSync } from "node:child_process";
const data = await fs.mkdtemp(path.join(os.tmpdir(), "gbot-electron-"));
const packaged = process.argv.includes("--packaged");
const executablePath = packaged
  ? process.platform === "win32"
    ? path.resolve("release/win-unpacked/G-Bot.exe")
    : path.resolve(
        `release/mac${process.arch === "arm64" ? "-arm64" : ""}/G-Bot.app/Contents/MacOS/G-Bot`,
      )
  : undefined;
const args = [
  ...(packaged ? [] : [path.resolve(".")]),
  `--user-data-dir=${data}`,
];
const nativeErrors = [];
const launch = async () => {
  const instance = await electron.launch({
    executablePath,
    args,
    timeout: 60000,
    env: { ...process.env, NODE_ENV: "production" },
  });
  instance.context().setDefaultTimeout(15000);
  instance.on("console", (message) => {
    const text = message.text();
    console.log("[main]", text);
    if (/uncaughtException|TypeError: Invalid URL/.test(text))
      nativeErrors.push(text);
  });
  instance
    .process()
    .stderr.on("data", (data) => console.log("[electron]", data.toString()));
  await instance.evaluate(({ app, BrowserWindow }) => {
    for (const event of [
      "before-quit",
      "will-quit",
      "quit",
      "window-all-closed",
    ])
      app.on(event, () =>
        console.log(
          `[lifecycle] ${event}; windows=${BrowserWindow.getAllWindows().length}`,
        ),
      );
  });
  return instance;
};
async function closeApp(instance, label) {
  console.log(`[shutdown] ${label}: requesting graceful close`);
  let timer;
  try {
    await Promise.race([
      instance.close(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(Error(`${label}: Electron did not exit within 45 seconds`)),
          45000,
        );
      }),
    ]);
    console.log(`[shutdown] ${label}: process exited`);
  } catch (error) {
    // Cleanup only after a failing shutdown assertion; never report a killed app as a pass.
    const child = instance.process();
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === "win32")
        execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          timeout: 10000,
        });
      else child.kill("SIGKILL");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
const app = await launch();
try {
  const page = await app.firstWindow({ timeout: 60000 });
  await page
    .getByRole("heading", { name: "Meet your new way to work." })
    .waitFor({ timeout: 60000 });
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  for (const provider of ["Google", "Microsoft"]) {
    await page.getByRole("button", { name: provider, exact: true }).click();
    await page
      .getByText(
        `${provider} sign-in isn't configured for this environment yet.`,
        { exact: false },
      )
      .waitFor();
  }
  await page
    .getByRole("link", { name: "Back to Welcome", exact: false })
    .click();
  await page
    .getByRole("link", { name: "Create account", exact: false })
    .click();
  await page
    .getByRole("heading", { name: "Create your G-Bot account" })
    .waitFor();
  await page
    .getByRole("link", { name: "Back to Welcome", exact: false })
    .click();
  const isolation = await page.evaluate(() => ({
    node: typeof window.require,
    bridge: !!window.gbot,
  }));
  if (isolation.node !== "undefined" || !isolation.bridge)
    throw Error("Renderer isolation failed");
  for (const [op, args] of [
    ["shell.exec", ["anything"]],
    ["entitlements.change", ["business"]],
    ["auth.demo", []],
  ]) {
    const result = await page.evaluate(
      ([op, args]) => window.gbot.call(op, args),
      [op, args],
    );
    if (result.ok) throw Error(`Production boundary bypass: ${op}`);
  }
  const prefs = JSON.stringify({
    state: {
      color: "blue",
      appearance: "dark",
      reducedMotion: true,
      drafts: { test: "private-native-draft" },
    },
    version: 1,
  });
  const saved = await page.evaluate(
    (value) => window.gbot.call("desktop.savePreferences", [value]),
    prefs,
  );
  if (!saved.ok) throw Error("OS-protected preferences could not be saved");
  await page.reload();
  await page
    .locator('html[data-color="blue"][data-appearance="dark"]')
    .waitFor();
  const disk = await fs.readFile(
    path.join(data, "real-v1", "preferences.json"),
    "utf8",
  );
  if (disk.includes("private-native-draft") || JSON.parse(disk).version !== 2)
    throw Error("Native preferences were not encrypted");
  const workspace = await fs.readFile(
    path.join(data, "real-v1", "workspace.json"),
    "utf8",
  );
  if (JSON.parse(workspace).version !== 2)
    throw Error("Workspace not encrypted");
  const primaryId = await app.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id,
  );
  await page.getByRole("button", { name: "Explore Demo", exact: true }).click();
  const demo = page;
  await demo.locator('html[data-app-ready="true"]').waitFor({ timeout: 60000 });

  await demo.getByRole("heading", { name: "What can we get done?" }).waitFor();
  await demo.reload();
  await demo.getByRole("heading", { name: "What can we get done?" }).waitFor();
  const demoWindows = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.id),
  );
  if (demoWindows.length !== 1 || demoWindows[0] !== primaryId)
    throw Error("Demo entry/reload created another native window");
  if (await demo.evaluate(() => !!window.gbot))
    throw Error("Demo obtained native bridge");
  if (await demo.evaluate(() => innerWidth <= 1100))
    await demo
      .getByRole("button", { name: "Toggle left pane", exact: true })
      .click();
  await demo.locator(".record-detail:visible").first().waitFor();
  await fs.mkdir("test-results-electron", { recursive: true });
  await demo.screenshot({
    path: `test-results-electron/${packaged ? "packaged-" : ""}demo-workspace.png`,
  });
  await page.screenshot({
    path: `test-results-electron/${packaged ? "packaged-" : ""}production-signin.png`,
  });
  const unchanged = await fs.readFile(
    path.join(data, "real-v1", "workspace.json"),
    "utf8",
  );
  if (unchanged !== workspace) throw Error("Demo modified real workspace");
  if (await demo.locator(".mobile-pane").isVisible())
    await demo
      .getByRole("button", { name: "Close left pane", exact: true })
      .last()
      .click();
  await demo.getByRole("link", { name: "Exit Demo", exact: true }).click();
  await page
    .getByRole("heading", { name: "Meet your new way to work." })
    .waitFor();
  const windows = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.id),
  );
  if (windows.length !== 1 || windows[0] !== primaryId)
    throw Error("Navigation created another native window");
  if (!(await page.evaluate(() => !!window.gbot)))
    throw Error("Real bridge was not restored after Demo exit");
  console.log(
    "Native isolation, production entitlement rejection, encrypted storage, single-window isolated Demo and business panes passed. Live login is an external acceptance gate.",
  );
} catch (error) {
  await fs.mkdir("test-results-electron", { recursive: true });
  for (const [index, page] of app.windows().entries()) {
    await page
      .screenshot({
        path: `test-results-electron/failure-${packaged ? "packaged-" : ""}${index}.png`,
      })
      .catch(() => {});
    console.error(
      "Native failure page",
      index,
      page.url(),
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  }
  throw error;
} finally {
  await closeApp(app, "first launch");
}
const restarted = await launch();
try {
  const page = await restarted.firstWindow({ timeout: 60000 });
  await page
    .getByRole("heading", { name: "Meet your new way to work." })
    .waitFor({ timeout: 60000 });
  await page
    .locator('html[data-color="blue"][data-appearance="dark"]')
    .waitFor();
  const r = await page.evaluate(() =>
    window.gbot.call("desktop.readPreferences", []),
  );
  if (!r.ok || !r.value.includes("private-native-draft"))
    throw Error("Encrypted preferences did not survive restart");
  console.log("Encrypted native restart persistence passed.");
} finally {
  await closeApp(restarted, "restart");
}

if (nativeErrors.length)
  throw Error(`Uncaught native errors: ${nativeErrors.join("\n")}`);
await fs.rm(data, { recursive: true, force: true });
