import { release as osRelease } from "node:os";
import {
  clearWebCache,
  cacheMessage,
  cacheDetail,
  supportURL,
  Shutdown,
} from "./runtime/maintenance";
import { connectionAvailable } from "../src/lib/entitlements";
import { validateRouter } from "../src/lib/providers";
import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  safeStorage,
  dialog,
  session,
  Menu,
  clipboard,
} from "electron";
import { createServer } from "node:http";
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import next from "next";
import { validatePublicConfig } from "./runtime/public-config";
import { autoUpdater } from "electron-updater";
import {
  verifyUpdate,
  verifyInstaller,
  type UpdateManifest,
} from "./runtime/update-integrity";
import { SafeTelemetry } from "./runtime/telemetry";
import { CatalogClient } from "./runtime/catalog";
import { nativeData, applyRetention } from "./runtime/native-data";
import { ProductionIdentity } from "./runtime/identity";
import { EncryptedStore } from "./runtime/encrypted";
import { entitlementFor } from "../src/lib/entitlements";
import { Runtime, localDatabase, databaseShape } from "./runtime/service";
import { AtomicStore, SecretVault, stringMap } from "./runtime/storage";
import { HTTPInference } from "./adapters/providers";
import { RemoteMCP } from "./adapters/mcp";
import { externalURL } from "./runtime/security";
import { validateOperation, trustedSender } from "./runtime/ipc";
import { Diagnostics } from "./runtime/diagnostics";
import { DomainError, safeError } from "./runtime/errors";
let window: BrowserWindow | undefined;
let runtime: Runtime;
let origin = "";
let shuttingDown = false;
let readyToQuit = false;
let activeRequests = 0;
let demoMode = process.argv.includes("--demo");
let diagnostics: Diagnostics;
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  window?.show();
  window?.focus();
});
async function boot() {
  await app.whenReady();
  app.setAppLogsPath();
  const directory = join(app.getPath("userData"), "real-v1");
  diagnostics = new Diagnostics(
    app.getPath("logs"),
    new SafeTelemetry(
      process.env.GBOT_SENTRY_DSN,
      () => runtime?.db.preferences.diagnosticsConsent === true,
    ),
    {
      version: app.getVersion(),
      platform: process.platform,
      osVersion: osRelease(),
    },
  );
  await diagnostics.record("startup", "HEALTH");
  process.on("uncaughtExceptionMonitor", () => diagnostics?.fatal());

  const root = app.getAppPath();
  const configFile = join(root, "desktop-dist", "public-config.json");
  const bundled = validatePublicConfig(
    JSON.parse(await readFile(configFile, "utf8")),
  );
  for (const [key, value] of Object.entries(bundled)) {
    if (app.isPackaged || !process.env[key]) process.env[key] = value;
  }
  process.env.GBOT_DESKTOP_SERVER = "1";
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  const serverApp = next({ dev: false, dir: root, hostname: "127.0.0.1" });
  await serverApp.prepare();
  const handler = serverApp.getRequestHandler();
  const server = createServer((req, res) => {
    if (req.headers.host !== new URL(origin || "http://127.0.0.1").host) {
      res.writeHead(403);
      res.end();
      return;
    }
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Server address unavailable");
  origin = `http://127.0.0.1:${address.port}`;
  const vault = new SecretVault(
    new AtomicStore(directory, "credentials.json", () => ({}), stringMap),
    {
      available: async () =>
        (await safeStorage.isAsyncEncryptionAvailable()) &&
        (process.platform !== "linux" ||
          safeStorage.getSelectedStorageBackend() !== "basic_text"),
      encrypt: (value) => safeStorage.encryptStringAsync(value),
      decrypt: async (value) =>
        (await safeStorage.decryptStringAsync(value)).result,
    },
  );
  const mcp = new RemoteMCP(
    vault,
    (url) => shell.openExternal(externalURL(url)),
    (id, event) => {
      if (
        event === "Connection healthy" ||
        event === "Connection degraded" ||
        event === "Authorization expired"
      )
        void diagnostics.record(
          event === "Connection healthy" ? "mcp_connected" : "mcp_unavailable",
          "HEALTH",
        );
      if (event !== "Connection healthy" && event !== "Connection degraded")
        runtime.event(id, event, "completed");
      const c = runtime.db.connections.find((c) => c.id === id);
      if (c && event === "Waiting for browser authorization")
        c.status = "authenticating";
      if (c && event === "Connection degraded" && c.status === "connected")
        c.status = "degraded";
      if (c && event === "Connection healthy" && c.status === "degraded")
        c.status = "connected";
      if (c && event === "Authorization expired") {
        c.status = "authorization expired";
        c.enabled = false;
      }
      void runtime
        .save()
        .catch(() => diagnostics.record("storage_failure", "PERSISTENCE"));
    },
  );
  let verifiedManifest: UpdateManifest | undefined;
  let verifiedDownload = false;
  const update = async (action: "check" | "download") => {
    if (!app.isPackaged)
      throw new DomainError(
        "CAPABILITY",
        "Updates require a signed packaged release and configured publishing feed.",
      );
    await catalog.assertAllowed("", "updates");
    if (action === "check") {
      verifiedManifest = undefined;
      verifiedDownload = false;
      const manifestUrl = process.env.GBOT_RELEASE_MANIFEST_URL,
        keys = JSON.parse(process.env.GBOT_UPDATE_PUBLIC_KEYS ?? "{}");
      if (!manifestUrl || !Object.keys(keys).length)
        throw new DomainError(
          "CAPABILITY",
          "No verified release channel is configured yet.",
        );
      const response = await fetch(externalURL(manifestUrl), {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new DomainError(
          "NETWORK",
          "Release information is unavailable. Try again later.",
        );
      const raw = await response.text();
      if (raw.length > 16000) throw Error("Invalid release manifest");
      verifiedManifest = verifyUpdate(
        JSON.parse(raw),
        keys,
        app.getVersion(),
        process.platform,
        process.arch,
      );
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo.version !== verifiedManifest.version) {
        verifiedManifest = undefined;
        throw new DomainError(
          "CAPABILITY",
          "Release feed does not match its signed manifest.",
        );
      }
    } else {
      if (!verifiedManifest)
        throw new DomainError(
          "CAPABILITY",
          "Check for a verified update first.",
        );
      try {
        const files = await autoUpdater.downloadUpdate();
        if (!files.length) throw Error("No installer downloaded");
        for (const file of files) await verifyInstaller(file, verifiedManifest);
        verifiedDownload = true;
        runtime.db.updateStatus = "restart required";
        await runtime.save();
      } catch {
        verifiedDownload = false;
        runtime.db.updateStatus = "failed";
        await runtime.save();
        throw new DomainError(
          "CAPABILITY",
          "The update could not be verified. Check for updates and try again.",
        );
      }
    }
  };
  await vault.init();
  const identity = new ProductionIdentity(
    vault,
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      controlOrigin:
        process.env.GBOT_CONTROL_PLANE_URL ?? "https://account.vidinex.ee",
      environment:
        process.env.NEXT_PUBLIC_GBOT_ENVIRONMENT === "production"
          ? "production"
          : process.env.NEXT_PUBLIC_GBOT_ENVIRONMENT === "staging"
            ? "staging"
            : "development",
      publicKeys: JSON.parse(process.env.GBOT_LICENSE_PUBLIC_KEYS ?? "{}"),
      version: "1.0.0",
      platform: process.platform === "darwin" ? "darwin" : "win32",
    },
    (url) => shell.openExternal(externalURL(url)),
    async (license, user) => {
      if (user) runtime.db.user = user;
      if (license) {
        if (runtime.db.runtime) runtime.db.runtime.sessionNotice = undefined;
        runtime.db.entitlement = entitlementFor(license.plan);
        runtime.db.entitlement.renewalAt = new Date(
          license.expiresAt,
        ).toISOString();
      } else {
        runtime.db.entitlement.status = "expired";
        if (!user) runtime.db.user = null;
      }
      await runtime.save();
    },
  );
  const catalog = new CatalogClient(
    vault,
    process.env.GBOT_CONTROL_PLANE_URL ?? "https://account.vidinex.ee",
    JSON.parse(process.env.GBOT_CATALOG_PUBLIC_KEYS ?? "{}"),
  );
  const inference = new HTTPInference();
  const guardedMcp = {
    paneMappings: () => catalog.paneMappings(),
    connect: async (...args: Parameters<typeof mcp.connect>) => {
      await identity.ensure();
      await catalog.assertAllowed(args[0].url);
      return mcp.connect(...args);
    },
    disconnect: (id: string) => mcp.disconnect(id),
    sources: async (
      c: import("../src/types/domain").MCPConnection,
      signal?: AbortSignal,
    ) => {
      await identity.ensure();
      if (!connectionAvailable(runtime.db.entitlement, c))
        throw Error("Connection unavailable.");
      await catalog.assertAllowed(c.url);
      return mcp.sources(c, signal);
    },
    readResource: async (...args: Parameters<typeof mcp.readResource>) => {
      await identity.ensure();
      if (!connectionAvailable(runtime.db.entitlement, args[0]))
        throw Error("Connection unavailable.");
      await catalog.assertAllowed(args[0].url);
      return mcp.readResource(...args);
    },
    call: async (...args: Parameters<typeof mcp.call>) => {
      await identity.ensure();
      if (
        !connectionAvailable(runtime.db.entitlement, args[0]) ||
        !args[1].enabled
      )
        throw new Error("Connection or tool permission is no longer active.");
      await catalog.assertAllowed(args[0].url);
      return mcp.call(...args);
    },
  };
  runtime = new Runtime(
    new EncryptedStore(
      directory,
      "workspace.json",
      localDatabase,
      databaseShape,
      vault,
    ),
    vault,
    {
      generate: async (...args: Parameters<typeof inference.generate>) => {
        await identity.ensure();
        validateRouter(args[0], runtime.db.entitlement);
        void diagnostics.record("ai_started", "HEALTH");
        try {
          const result = await inference.generate(...args);
          void diagnostics.record("ai_completed", "HEALTH");
          return result;
        } catch (e) {
          void diagnostics.record("ai_failed", safeError(e).code);
          throw e;
        }
      },
    },
    guardedMcp,
    { check: () => update("check"), download: () => update("download") },
    identity,
  );
  await runtime.init();
  await runtime.restoreSession();
  if (runtime.db.preferences.historyRetention)
    await applyRetention(runtime, runtime.db.preferences.historyRetention);
  const prefs = new EncryptedStore<string | null>(
    directory,
    "preferences.json",
    () => null,
    (v): v is string | null => v === null || typeof v === "string",
    vault,
  );
  let preferences = await prefs.read();
  const demoStore = new EncryptedStore<Record<string, string>>(
    join(app.getPath("userData"), "demo-v1"),
    "demo.json",
    () => ({}),
    stringMap,
    vault,
  );
  const demoData = await demoStore.read();
  const demoKey = (key: unknown): key is string =>
    key === "gbot-demo-v1" || key === "gbot-workspace-v1";
  const trustedDemo = (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
  ) =>
    !!window &&
    !window.isDestroyed() &&
    demoMode &&
    !!event.senderFrame &&
    trustedSender(
      event.sender.id,
      window.webContents.id,
      event.senderFrame.url,
      origin,
      event.senderFrame === event.sender.mainFrame,
    );
  ipcMain.on("gbot:demo-read", (event, key: unknown) => {
    try {
      event.returnValue =
        trustedDemo(event) && demoKey(key) ? (demoData[key] ?? null) : null;
    } catch {
      event.returnValue = null;
    }
  });
  ipcMain.handle(
    "gbot:demo-write",
    async (event, key: unknown, value: unknown) => {
      if (
        shuttingDown ||
        !trustedDemo(event) ||
        !demoKey(key) ||
        (value !== null &&
          (typeof value !== "string" || value.length > 20_000_000))
      )
        throw new Error("Invalid Demo storage request");
      if (value === null) delete demoData[key];
      else {
        JSON.parse(value as string);
        demoData[key] = value as string;
      }
      await demoStore.write(demoData);
    },
  );
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  for (const [event, state] of [
    ["checking-for-update", "checking"],
    ["update-available", "available"],
    ["update-not-available", "up to date"],
    ["download-progress", "downloading"],
    ["error", "failed"],
  ] as const)
    autoUpdater.on(event, () => {
      runtime.db.updateStatus = state;
      runtime.event(
        "",
        `Update ${state}`,
        state === "failed" ? "failed" : "completed",
      );
      void diagnostics.record("update_state", "UPDATE");
      if (state === "failed" && runtime.db.runtime)
        runtime.db.runtime.updateError =
          "Update failed. Check the release feed, signing configuration and network.";
      void runtime
        .save()
        .catch(() => diagnostics.record("storage_failure", "PERSISTENCE"));
    });
  const createWindow = async () => {
    window = new BrowserWindow({
      width: 1440,
      height: 1000,
      minWidth: 390,
      minHeight: 600,
      show: false,
      title: "G-Bot",
      webPreferences: {
        preload: join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: !app.isPackaged,
      },
    });
    window.webContents.on("render-process-gone", () => {
      void diagnostics.record("renderer_failure", "RENDERER");
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url === supportURL || url === "mailto:gbot@vidinex.ee") {
        void contactSupport();
        return { action: "deny" };
      }
      try {
        void shell.openExternal(externalURL(url)).catch(() => {});
      } catch {
        /* Unsupported schemes are denied. */
      }
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (url === supportURL || url === "mailto:gbot@vidinex.ee") {
        event.preventDefault();
        void contactSupport();
        return;
      }
      const target = new URL(url);
      if (target.origin !== origin) {
        event.preventDefault();
        return;
      }
      if (
        demoMode &&
        target.searchParams.get("returnToApp") === "1" &&
        ["/", "/login", "/signup"].includes(target.pathname)
      ) {
        event.preventDefault();
        void (async () => {
          await runtime.restoreSession();
          demoMode = false;
          await window?.loadURL(
            origin + (runtime.db.user ? "/workspace" : target.pathname),
          );
        })();
      }
    });
    window.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    window.once("ready-to-show", () => window?.show());
    try {
      await window.loadURL(
        origin + (demoMode ? "/demo" : runtime.db.user ? "/workspace" : "/"),
      );
    } catch (error) {
      // A reload/new navigation cancels the previous load with ERR_ABORTED.
      // Destroying a loading window can also report ERR_FAILED. Neither is a
      // startup failure during an intentional quit; a modal would block exit.
      if (!shuttingDown && (error as { code?: string })?.code !== "ERR_ABORTED")
        throw error;
    }
  };
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  // Read-only preload handshake. No business data or credentials cross this channel.
  ipcMain.on("gbot:context", (event) => {
    let trusted = false;
    try {
      const frame = event.senderFrame;
      trusted =
        !!window &&
        !window.isDestroyed() &&
        !demoMode &&
        !!frame &&
        trustedSender(
          event.sender.id,
          window.webContents.id,
          frame.url,
          origin,
          frame === event.sender.mainFrame,
        );
    } catch {
      // A frame can disappear during navigation. Keep the denial.
    } finally {
      // Always release sendSync, including initial/tearing-down frames.
      event.returnValue = trusted;
    }
  });
  ipcMain.handle(
    "gbot:request",
    async (event, operation: unknown, args: unknown) => {
      let counted = false;
      try {
        if (
          !window ||
          demoMode ||
          !event.senderFrame ||
          !trustedSender(
            event.sender.id,
            window.webContents.id,
            event.senderFrame.url,
            origin,
            event.senderFrame === event.sender.mainFrame,
          )
        )
          throw new DomainError(
            "INVALID_ARGUMENTS",
            "Untrusted desktop request.",
          );
        if (shuttingDown)
          throw new DomainError("CAPABILITY", "G-Bot is closing. Please wait.");
        const request = validateOperation(operation, args);
        activeRequests++;
        counted = true;
        const a = request.args;
        let value: unknown;
        if (request.operation === "snapshot")
          value = await runtime.services.snapshot();
        else if (request.operation === "desktop.support")
          value = await contactSupport();
        else if (request.operation === "desktop.openLogs")
          value = await openLogs();
        else if (request.operation === "desktop.copyDiagnostics")
          value = await copyDiagnostics();
        else if (request.operation === "desktop.rendererError")
          value = await diagnostics.record("renderer_failure", "RENDERER");
        else if (request.operation === "desktop.paneSources")
          value = await runtime.snapshots.sources(a[0] as string);
        else if (request.operation === "desktop.paneChoices")
          value = await runtime.snapshots.choices(
            a[0] as string,
            a[1] as string,
            a[2] as string,
            a[3] as string,
            a[4] as boolean,
          );
        else if (request.operation === "desktop.configurePane") {
          await runtime.snapshots.configure(
            a[0] as string,
            a[1] as import("../src/types/snapshot").SnapshotConfig | null,
          );
          await runtime.save();
        } else if (request.operation === "desktop.catalog")
          value = await catalog.get();
        else if (request.operation === "desktop.data") {
          if (["audit", "audit-retention"].includes(a[0] as string))
            await identity.ensure();
          value = await nativeData(
            runtime,
            directory,
            a[0] as string,
            a[1] as string,
          );
        } else if (request.operation === "desktop.removeAttachment")
          value = runtime.attachments.remove(a[0] as string);
        else if (request.operation === "desktop.retention")
          value = await applyRetention(
            runtime,
            a[0] as 0 | 30 | 90 | 180,
            true,
          );
        else if (request.operation === "desktop.signIn")
          value = await identity.browser(a[0] as "google" | "azure");
        else if (request.operation === "desktop.verifyMfa")
          value = await identity.mfa(a[0] as string);
        else if (request.operation === "desktop.refreshLicense")
          value = await identity.ensure(true);
        else if (request.operation === "desktop.openAccount")
          value = await shell.openExternal(
            externalURL(
              (process.env.GBOT_CONTROL_PLANE_URL ??
                "https://account.vidinex.ee") + "/portal",
            ),
          );
        else if (request.operation === "desktop.readPreferences")
          value = preferences;
        else if (request.operation === "desktop.savePreferences") {
          if (a[0] !== null) {
            const parsed = JSON.parse(a[0] as string);
            if (!parsed.state || typeof parsed.state !== "object")
              throw new Error("Invalid preferences");
          }
          preferences = a[0] as string | null;
          await prefs.write(preferences);
        } else if (request.operation === "desktop.openDemo") {
          runtime.engine.stopAll();
          demoMode = true;
          // A full navigation unloads the live renderer and its bridge. The same native window is retained.
          setImmediate(() => {
            void window?.loadURL(origin + "/demo");
          });
        } else if (request.operation === "desktop.diagnostics") {
          value = await supportReport();
        } else if (request.operation === "desktop.installUpdate") {
          if (
            !verifiedDownload ||
            runtime.db.updateStatus !== "restart required"
          )
            throw new DomainError(
              "INVALID_ARGUMENTS",
              "No verified update is ready.",
            );
          autoUpdater.quitAndInstall();
        } else if (request.operation === "desktop.pickFiles") {
          const result = await dialog.showOpenDialog(window, {
            properties: ["openFile", "multiSelections"],
            filters: [
              {
                name: "Text documents",
                extensions: [
                  "pdf",
                  "docx",
                  "xlsx",
                  "txt",
                  "md",
                  "csv",
                  "png",
                  "jpg",
                  "jpeg",
                  "webp",
                ],
              },
            ],
          });
          value = [];
          if (!result.canceled) {
            if (result.filePaths.length > 5)
              throw new DomainError("CAPABILITY", "Select at most five files.");
            value = await Promise.all(
              result.filePaths.map(async (path) => {
                if ((await stat(path)).size > 50 * 1024 * 1024)
                  throw new DomainError(
                    "CAPABILITY",
                    "Maximum file size is 50 MB.",
                  );
                return await runtime.attachments.ingestFile(
                  path.split(/[\\/]/).at(-1)!,
                  "text/plain",
                  await readFile(path),
                );
              }),
            );
          }
        } else if (request.operation === "attachments.process") {
          const f = a[0] as { name: string; type: string; bytes: number[] };
          value = await runtime.attachments.ingestFile(
            f.name,
            f.type,
            Uint8Array.from(f.bytes),
          );
        } else {
          const [group, method] = request.operation.split(".");
          const service = runtime.services[
            group as keyof typeof runtime.services
          ] as unknown as Record<string, (...args: unknown[]) => unknown>;
          value = await service[method](...a);
        }
        return { ok: true, value };
      } catch (error) {
        const safe = safeError(error);
        void diagnostics.record("ipc_failure", safe.code);
        return { ok: false, error: { code: safe.code, message: safe.message } };
      } finally {
        if (counted) activeRequests--;
      }
    },
  );
  let lastDiagnosticActivity = "";
  runtime.services.subscribe(() => {
    const event = runtime.db.activity[0];
    if (event && event.id !== lastDiagnosticActivity) {
      lastDiagnosticActivity = event.id;
      if (event.action === "Business snapshot refreshed")
        void diagnostics.record("snapshot_ready", "HEALTH");
      if (event.action === "Business snapshot unavailable")
        void diagnostics.record("snapshot_failed", "TOOL_FAILED");
      if (event.action === "MCP tools discovered; review permissions")
        void diagnostics.record("mcp_connected", "HEALTH");
      if (event.action === "MCP connection failed")
        void diagnostics.record("mcp_unavailable", "MCP_UNAVAILABLE");
    }
    if (window && !window.isDestroyed())
      window.webContents.send("gbot:changed");
  });
  const supportReport = async () =>
    JSON.stringify(
      {
        format: "g-bot-support",
        version: app.getVersion(),
        platform: process.platform,
        osVersion: osRelease(),
        architecture: process.arch,
        environment: ["staging", "production"].includes(
          process.env.NEXT_PUBLIC_GBOT_ENVIRONMENT ?? "",
        )
          ? process.env.NEXT_PUBLIC_GBOT_ENVIRONMENT
          : "development",
        mode: demoMode ? "demo" : "real",
        credentialProtection: "OS secure storage",
        ...(demoMode
          ? {}
          : {
              plan: runtime.db.entitlement.plan,
              status: runtime.db.entitlement.status,
              connections: runtime.db.connections.length,
              connected: runtime.db.connections.filter((c) => c.enabled).length,
              providers: runtime.db.providers.length,
              updateStatus: runtime.db.updateStatus,
            }),
        recentErrors: demoMode ? [] : await diagnostics.recent(),
      },
      null,
      2,
    );
  const contactSupport = async () => {
    try {
      await shell.openExternal(supportURL);
    } catch {
      await dialog.showMessageBox({
        type: "info",
        message: "Contact G-Bot Support",
        detail:
          "No email application could be opened. Email gbot@vidinex.ee. You can explicitly copy sanitized diagnostics from Help.",
      });
    }
  };
  const openLogs = async () => {
    const failure = await shell.openPath(diagnostics.directory);
    if (failure)
      await dialog.showMessageBox({
        type: "error",
        message: "Logs folder could not be opened",
        detail: diagnostics.directory,
      });
  };
  const copyDiagnostics = async () => {
    clipboard.writeText(await supportReport());
  };
  const reportFailure = () => {
    void diagnostics.record("main_failure", "MAIN");
  };

  const shutdown = new Shutdown(
    async () => {
      shuttingDown = true;
      await Promise.all([runtime.engine.drain(), runtime.snapshots.drain()]);
      const deadline = Date.now() + 10_000;
      while (activeRequests) {
        if (Date.now() > deadline) throw Error("Requests have not finished.");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await Promise.all(
        runtime.db.connections.map((c) => mcp.disconnect(c.id)),
      );
    },
    async () => {
      await Promise.all([
        runtime.save(),
        prefs.write(preferences),
        demoStore.write(demoData),
      ]);
      await diagnostics.flush();
    },
    (restart) => {
      server.close();
      readyToQuit = true;
      if (restart)
        app.relaunch({
          args: [
            ...process.argv.slice(1).filter((a) => a !== "--demo"),
            ...(demoMode ? ["--demo"] : []),
          ],
        });
      app.quit();
    },
  );
  const quit = async (restart = false) => {
    try {
      await shutdown.run(restart);
    } catch {
      shuttingDown = false;
      await diagnostics.record("storage_failure", "PERSISTENCE");
      await dialog.showMessageBox({
        type: "error",
        message: "G-Bot could not close safely",
        detail:
          "An operation or save has not completed. Your workspace is still open. Wait and try again; do not repeat external changes without checking their outcome.",
      });
    }
  };
  const restart = async () => {
    if (
      activeRequests > 0 ||
      runtime.engine.active ||
      runtime.snapshots.active
    ) {
      const answer = await dialog.showMessageBox({
        type: "warning",
        buttons: ["Cancel", "Stop work and restart"],
        defaultId: 0,
        cancelId: 0,
        message: "Restart while work is active?",
        detail:
          "AI and read requests will stop. External changes already submitted may still complete. Check Activity before repeating them. Pending approvals will be cancelled.",
      });
      if (answer.response !== 1) return;
    }
    await quit(true);
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "G-Bot",
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "New conversation",
            accelerator: "CmdOrCtrl+N",
            click: () => {
              void (async () => {
                if (demoMode) {
                  const saved = demoData["gbot-workspace-v1"];
                  if (saved) {
                    const next = JSON.parse(saved);
                    next.state.conversationId = "";
                    demoData["gbot-workspace-v1"] = JSON.stringify(next);
                    await demoStore.write(demoData);
                  }
                } else if (preferences) {
                  const next = JSON.parse(preferences);
                  next.state.conversationId = "";
                  preferences = JSON.stringify(next);
                  await prefs.write(preferences);
                }
                await window?.loadURL(origin + "/workspace");
              })().catch(() =>
                diagnostics.record("storage_failure", "PERSISTENCE"),
              );
            },
          },
          { type: "separator" },
          {
            label: "Clear Cache & Cookies…",
            click: () => {
              void (async () => {
                const answer = await dialog.showMessageBox({
                  type: "question",
                  buttons: ["Cancel", "Clear cache and cookies"],
                  defaultId: 0,
                  cancelId: 0,
                  message: cacheMessage,
                  detail: cacheDetail,
                });
                if (answer.response !== 1) return;
                try {
                  await clearWebCache(
                    window?.webContents.session ?? session.defaultSession,
                  );
                  await diagnostics.record("maintenance", "CACHE");
                } catch {
                  await dialog.showMessageBox({
                    type: "error",
                    message:
                      "Some cache or cookies could not be cleared. Please try again.",
                  });
                }
              })();
            },
          },
          {
            label: "Restart G-Bot",
            click: () => {
              void restart();
            },
          },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          {
            label: "Back",
            accelerator: process.platform === "darwin" ? "Cmd+[" : "Alt+Left",
            click: () => window?.webContents.send("gbot:back"),
          },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "G-Bot Help / Troubleshooting",
            click: () => {
              void window
                ?.loadURL(origin + "/g-bot/support")
                .catch(reportFailure);
            },
          },
          {
            label: "Open Logs Folder",
            click: () => {
              void openLogs();
            },
          },
          {
            label: "Copy Diagnostic Information",
            click: () => {
              void copyDiagnostics();
            },
          },
          {
            label: "Contact Support",
            click: () => {
              void contactSupport();
            },
          },
          { type: "separator" },
          { role: "about", label: "About G-Bot" },
        ],
      },
    ]),
  );
  // A visible/interactive renderer does not imply loadURL() has settled.
  // Install shutdown handling before navigation can be cancelled by a quit.
  app.on("before-quit", (event) => {
    if (readyToQuit) return;
    event.preventDefault();
    void quit();
  });
  app.on("activate", () => {
    if (!shuttingDown && BrowserWindow.getAllWindows().length === 0)
      void createWindow();
  });
  await createWindow();
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
void boot().catch(async (error) => {
  await diagnostics?.record("startup_failure", safeError(error).code);
  dialog.showErrorBox(
    "G-Bot could not start",
    "Check local storage access and reinstall the application if needed. No credentials were exposed.",
  );
  app.quit();
});
