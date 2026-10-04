import { createServer } from "node:net";
import { _electron as electron, chromium } from "playwright";
import { expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { execFileSync } from "node:child_process";
const data = await fs.mkdtemp(path.join(os.tmpdir(), "gbot-electron-"));
const packaged = process.argv.includes("--packaged");
const executablePath = packaged
  ? process.platform === "win32"
    ? path.resolve("release/win-unpacked/G-Bot.exe")
    : process.platform === "linux"
      ? path.resolve("release/linux-unpacked/g-bot-astra")
      : path.resolve(
          `release/mac${process.arch === "arm64" ? "-arm64" : ""}/G-Bot.app/Contents/MacOS/G-Bot`,
        )
  : undefined;
const args = [
  ...(process.platform === "linux"
    ? ["-r", path.resolve("scripts/electron-test-keyring.cjs")]
    : []),
  ...(packaged ? [] : [path.resolve(".")]),
  `--user-data-dir=${data}`,
];
const nativeErrors = [];
const heldNavigations = new WeakMap();
const heldURLs = new WeakMap();
const launch = async (holdInitialNavigation = false) => {
  const instance = await electron.launch({
    executablePath,
    args,
    timeout: 60000,
    env: { ...process.env, NODE_ENV: "production" },
  });
  instance.context().setDefaultTimeout(15000);
  if (holdInitialNavigation) {
    await instance.context().route("**/*", (route) => {
      if (route.request().isNavigationRequest()) {
        // Keep the initial load pending until closeApp destroys the window.
        heldNavigations.set(instance, (heldNavigations.get(instance) ?? 0) + 1);
        heldURLs.set(instance, route.request().url());
        console.log("[startup] holding initial navigation");
      } else return route.continue();
    });
  }
  instance.on("console", (message) => {
    const text = message.text();
    console.log("[main]", text);
    if (/uncaughtException|TypeError: Invalid URL/.test(text))
      nativeErrors.push(text);
  });
  instance
    .process()
    .on("exit", (code, signal) =>
      console.log(
        `[process] pid=${instance.process().pid} exit=${code} signal=${signal}`,
      ),
    );
  instance.process().stdout.on("data", (data) => {
    const text = data.toString();
    console.log("[stdout]", text);
    if (text.includes("[native-error]"))
      nativeErrors.push("Unexpected native error dialog");
  });
  instance
    .process()
    .stderr.on("data", (data) => console.log("[electron]", data.toString()));
  await instance.evaluate(({ app, BrowserWindow, dialog }) => {
    const showErrorBox = dialog.showErrorBox;
    dialog.showErrorBox = (...args) => {
      process.stdout.write("[native-error] unexpected error dialog\n");
      return showErrorBox.apply(dialog, args);
    };
    for (const event of [
      "before-quit",
      "will-quit",
      "quit",
      "window-all-closed",
    ])
      app.on(event, () =>
        process.stdout.write(
          `[lifecycle] ${event}; windows=${BrowserWindow.getAllWindows().length}\n`,
        ),
      );
  });
  await instance.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      for (const event of ["close", "closed", "unresponsive"]) {
        window.on(event, () => process.stdout.write(`[window] ${event}\n`));
      }
    }
  });
  return instance;
};
async function closeApp(instance, label) {
  console.log(`[shutdown] ${label}: requesting graceful close`);
  const child = instance.process();
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
    if (child.exitCode !== 0 || child.signalCode !== null)
      throw Error(
        `${label}: abnormal Electron exit (${child.exitCode}, ${child.signalCode})`,
      );
    console.log(`[shutdown] ${label}: process exited cleanly`);
  } catch (error) {
    // Cleanup only after a failing shutdown assertion; never report a killed app as a pass.
    console.error(
      `[shutdown] ${label}: pid=${child.pid} exit=${child.exitCode} signal=${child.signalCode}`,
    );
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
  const signIn = page.getByRole("link", { name: "Sign in", exact: true });
  await signIn.waitFor({ state: "visible" });
  if ((await signIn.getAttribute("href")) !== "/login?returnToApp=1")
    throw Error("Native account link was exposed before bridge detection");
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
  const accountPrefs = {
    startup: false,
    notifications: false,
    activityVisible: false,
    diagnosticsConsent: true,
    historyRetention: 90,
    onboardingStep: 3,
  };
  const settingsSaved = await page.evaluate(
    (values) => window.gbot.call("account.preferences", [values]),
    accountPrefs,
  );
  if (!settingsSaved.ok) throw Error("Native durable settings save failed");
  const workspace = await fs.readFile(
    path.join(data, "real-v1", "workspace.json"),
    "utf8",
  );
  if (JSON.parse(workspace).version !== 2)
    throw Error("Workspace not encrypted");
  // Native maintenance operates on cookies/cache only, never the encrypted stores.
  const vaultBefore = await fs.readFile(
    path.join(data, "real-v1", "credentials.json"),
    "utf8",
  );
  await app.evaluate(async ({ session }) => {
    await session.defaultSession.cookies.set({
      url: "http://127.0.0.1",
      name: "maintenance-fixture",
      value: "cookie-only",
    });
  });
  await app.evaluate(({ Menu, dialog, shell }) => {
    globalThis.gbotMenuFixture = {
      dialog: dialog.showMessageBox,
      openPath: shell.openPath,
      openExternal: shell.openExternal,
      paths: [],
      urls: [],
    };
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
    shell.openPath = async (path) => {
      globalThis.gbotMenuFixture.paths.push(path);
      return "";
    };
    shell.openExternal = async (url) => {
      globalThis.gbotMenuFixture.urls.push(url);
    };
    const menu = Menu.getApplicationMenu();
    if (!menu.items.find((i) => i.label === "Help"))
      throw Error("Help menu missing");
    const clear = menu.items
      .find((i) => i.label === "G-Bot")
      .submenu.items.find((i) => i.label === "Clear Cache & Cookies…");
    clear.click();
  });
  await expect
    .poll(() =>
      app.evaluate(
        async ({ session }) =>
          (
            await session.defaultSession.cookies.get({
              name: "maintenance-fixture",
            })
          ).length,
      ),
    )
    .toBe(0);
  if (
    (await fs.readFile(
      path.join(data, "real-v1", "credentials.json"),
      "utf8",
    )) !== vaultBefore
  )
    throw Error("Cache clearing altered the credential vault");
  const preserved = await page.evaluate(() =>
    window.gbot.call("desktop.readPreferences", []),
  );
  if (!preserved.ok || preserved.value !== prefs)
    throw Error("Cache clearing altered preferences");
  await app.evaluate(({ Menu }) => {
    const help = Menu.getApplicationMenu().items.find(
      (i) => i.label === "Help",
    ).submenu;
    for (const label of [
      "Open Logs Folder",
      "Contact Support",
      "Copy Diagnostic Information",
    ])
      help.items.find((i) => i.label === label).click();
  });
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toContain('"format": "g-bot-support"');
  const nativeSupport = await app.evaluate(
    ({ app, clipboard, dialog, shell }) => {
      const f = globalThis.gbotMenuFixture;
      dialog.showMessageBox = f.dialog;
      shell.openPath = f.openPath;
      shell.openExternal = f.openExternal;
      return {
        paths: f.paths,
        urls: f.urls,
        logs: app.getPath("logs"),
        diagnostics: clipboard.readText(),
      };
    },
  );
  expect(nativeSupport.paths).toEqual([nativeSupport.logs]);
  expect(nativeSupport.urls).toEqual([
    "mailto:gbot@vidinex.ee?subject=G-Bot%20Support%20%E2%80%94%20Desktop",
  ]);
  if (
    /private-native-draft|fixture-token|authorization|password/i.test(
      nativeSupport.diagnostics,
    )
  )
    throw Error("Diagnostics exposed private content");
  const log = await fs.readFile(
    path.join(nativeSupport.logs, "diagnostics.jsonl"),
    "utf8",
  );
  if (!log.includes('"startup"')) throw Error("Startup diagnostics missing");
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
  await demo.goto(new URL("/connections", demo.url()).href);
  await expect(demo.locator(".connection-card")).toHaveCount(0);
  await expect(demo.locator(".connection-summary")).toContainText("0 of 8");
  await demo.goto(new URL("/settings", demo.url()).href);
  await demo.getByRole("button", { name: "General", exact: true }).click();
  await demo.getByRole("switch", { name: "Desktop notifications" }).uncheck();
  await demo.getByRole("button", { name: "Advanced", exact: true }).click();
  await demo
    .getByRole("switch", { name: "Inventory unavailable", exact: true })
    .check();
  await demo.getByLabel("Next sign-in failure").selectOption("network");
  await demo.getByRole("button", { name: "Appearance", exact: true }).click();
  await demo.getByRole("radio", { name: "green", exact: true }).check();
  // The Demo store has no ability to read or write real workspace keys.
  await expect(
    demo.evaluate(() => window.gbotDemo.setItem("workspace.json", "{}")),
  ).rejects.toThrow();
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
  console.error("Native assertion failed", error);
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
for (let restart = 1; restart <= 6; restart++) {
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
    const restored = await page.evaluate(() =>
      window.gbot.call("snapshot", []),
    );
    expect(restored.value.preferences).toMatchObject({
      startup: false,
      notifications: false,
      activityVisible: false,
      diagnosticsConsent: true,
      historyRetention: 90,
      onboardingStep: 3,
    });
    if (restart === 1) {
      await page
        .getByRole("button", { name: "Explore Demo", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "What can we get done?" })
        .waitFor();
      await expect(page.locator("html")).toHaveAttribute("data-color", "green");
      await page.goto(new URL("/settings", page.url()).href);
      await page.getByRole("button", { name: "Advanced", exact: true }).click();
      await expect(
        page.getByRole("switch", {
          name: "Inventory unavailable",
          exact: true,
        }),
      ).toBeChecked();
      await expect(page.getByLabel("Next sign-in failure")).toHaveValue(
        "network",
      );
      await page.getByRole("button", { name: "General", exact: true }).click();
      await expect(
        page.getByRole("switch", { name: "Desktop notifications" }),
      ).not.toBeChecked();
      const demoDisk = await fs.readFile(
        path.join(data, "demo-v1", "demo.json"),
        "utf8",
      );
      if (
        JSON.parse(demoDisk).version !== 2 ||
        demoDisk.includes("inventoryFailure")
      )
        throw Error("Demo storage was not encrypted");
    }
    console.log(
      "Encrypted native and isolated Demo restart persistence passed.",
    );
  } finally {
    await closeApp(restarted, `restart ${restart}`);
  }
}

// Reproduce the shutdown race deterministically: the native window exists,
// but the initial load cannot finish before we request a normal app quit.
const loading = await launch(true);
try {
  await expect
    .poll(() => heldNavigations.has(loading), { timeout: 15000 })
    .toBe(true);
  expect(
    await loading.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      return (
        windows.length === 1 && windows[0].webContents.isLoadingMainFrame()
      );
    }),
  ).toBe(true);
} finally {
  await closeApp(loading, "quit during navigation");
}

const reloading = await launch(true);
try {
  await expect
    .poll(() => heldNavigations.get(reloading) ?? 0, { timeout: 15000 })
    .toBe(1);
  await reloading.evaluate(({ BrowserWindow }, url) => {
    // Start a replacement navigation without waiting for the held response.
    // Its promise is expected to reject when this test quits the app.
    void BrowserWindow.getAllWindows()[0]
      .loadURL(url)
      .catch(() => {});
  }, heldURLs.get(reloading));
  await expect
    .poll(() => heldNavigations.get(reloading) ?? 0, { timeout: 15000 })
    .toBe(2);
} finally {
  await closeApp(reloading, "replacement during initial navigation");
}

// Exercise the real native Back menu and relaunch, then attach to the new process.
const restartMenuApp = await launch();
const restartProcess = restartMenuApp.process();
let relaunchedBrowser;
try {
  const before = await restartMenuApp.firstWindow({ timeout: 60000 });
  await before
    .getByRole("heading", { name: "Meet your new way to work." })
    .waitFor({ timeout: 60000 });
  await before
    .getByRole("button", { name: "Explore Demo", exact: true })
    .click();
  await before
    .getByRole("heading", { name: "What can we get done?" })
    .waitFor();
  await before
    .getByRole("link", { name: "Settings", exact: true })
    .first()
    .click();
  await before.getByRole("button", { name: "Advanced", exact: true }).click();
  await before
    .getByRole("link", { name: "Configure a custom provider" })
    .click();
  await expect(before).toHaveURL(/\/providers$/);
  const accelerator = await restartMenuApp.evaluate(({ Menu }) => {
    const back = Menu.getApplicationMenu()
      .items.find((i) => i.label === "View")
      .submenu.items.find((i) => i.label === "Back");
    back.click();
    return back.accelerator;
  });
  expect(accelerator).toBe(
    process.platform === "darwin" ? "Cmd+[" : "Alt+Left",
  );
  await expect(before).toHaveURL(/section=Advanced/);
  await expect(
    before.getByRole("heading", { name: "Simulation controls" }),
  ).toBeVisible();
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const exited = new Promise((resolve, reject) =>
    restartProcess.once("exit", (code, signal) =>
      code === 0 && !signal
        ? resolve()
        : reject(Error("Restart did not exit cleanly")),
    ),
  );
  await restartMenuApp.evaluate(({ app, Menu }, port) => {
    const relaunch = app.relaunch.bind(app);
    app.relaunch = (options) =>
      relaunch({
        ...options,
        args: [
          ...(options?.args ?? []).filter(
            (a) =>
              !a.startsWith("--remote-debugging-port") && a !== "--no-sandbox",
          ),
          "--no-sandbox",
          // Playwright appends this switch outside process.argv. Preserve its
          // existing test keychain so the real relaunch can decrypt the fixture.
          ...(process.platform === "darwin" ? ["--use-mock-keychain"] : []),
          `--remote-debugging-port=${port}`,
        ],
      });
    setTimeout(
      () =>
        Menu.getApplicationMenu()
          .items.find((i) => i.label === "G-Bot")
          .submenu.items.find((i) => i.label === "Restart G-Bot")
          .click(),
      0,
    );
  }, port);
  await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(Error("Restart did not complete")),
        45000,
      ).unref(),
    ),
  ]);
  await expect
    .poll(
      async () => {
        try {
          relaunchedBrowser = await chromium.connectOverCDP(
            `http://127.0.0.1:${port}`,
            { timeout: 1000 },
          );
          return true;
        } catch {
          return false;
        }
      },
      { timeout: 60000 },
    )
    .toBe(true);
  const context = relaunchedBrowser.contexts()[0];
  // CDP can connect before Electron has completed native initialization.
  // Match the same 60-second startup bound used by firstWindow above.
  await expect
    .poll(() => context.pages().length, { timeout: 60000 })
    .toBeGreaterThan(0);
  const after = context.pages()[0];
  await after
    .getByRole("heading", { name: "What can we get done?" })
    .waitFor({ timeout: 60000 });
  expect(
    await after.evaluate(() => ({
      native: !!window.gbot,
      demo: !!window.gbotDemo,
    })),
  ).toEqual({ native: false, demo: true });
  await expect(after.locator("html")).toHaveAttribute("data-color", "green");
  console.log(
    "Native Back and Restart passed; a new process preserved isolated Demo state.",
  );
  const cdp = await relaunchedBrowser.newBrowserCDPSession();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Relaunched process did not close")),
      15000,
    );
    relaunchedBrowser.once("disconnected", () => {
      clearTimeout(timer);
      resolve();
    });
    void cdp.send("Browser.close").catch(() => {});
  });
} finally {
  if (relaunchedBrowser) await relaunchedBrowser.close().catch(() => {});
  if (restartProcess.exitCode === null)
    await closeApp(restartMenuApp, "restart-menu cleanup");
}

if (nativeErrors.length)
  throw Error(`Uncaught native errors: ${nativeErrors.join("\n")}`);
await fs.rm(data, { recursive: true, force: true });
