import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  safeStorage,
  dialog,
  session,
  Menu,
} from "electron";
import { createServer } from "node:http";
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import next from "next";
import { autoUpdater } from "electron-updater";
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
let diagnostics: Diagnostics;
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  window?.show();
  window?.focus();
});
async function boot() {
  await app.whenReady();
  const root = app.getAppPath();
  process.env.GBOT_DESKTOP_SERVER = "1";
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
  const directory = join(app.getPath("userData"), "real-v1");
  diagnostics = new Diagnostics(directory);
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
  const update = async (action: "check" | "download") => {
    if (!app.isPackaged)
      throw new DomainError(
        "CAPABILITY",
        "Updates require a signed packaged release and configured publishing feed.",
      );
    if (action === "check") await autoUpdater.checkForUpdates();
    else await autoUpdater.downloadUpdate();
  };
  runtime = new Runtime(
    new AtomicStore(directory, "workspace.json", localDatabase, databaseShape),
    vault,
    new HTTPInference(),
    mcp,
    { check: () => update("check"), download: () => update("download") },
  );
  await runtime.init();
  const prefs = new AtomicStore<string | null>(
    directory,
    "preferences.json",
    () => null,
    (v): v is string | null => v === null || typeof v === "string",
  );
  let preferences = await prefs.read();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  for (const [event, state] of [
    ["checking-for-update", "checking"],
    ["update-available", "available"],
    ["update-not-available", "up to date"],
    ["download-progress", "downloading"],
    ["update-downloaded", "restart required"],
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
        preload: process.argv.includes("--demo")
          ? undefined
          : join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: !app.isPackaged,
      },
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      try {
        void shell.openExternal(externalURL(url)).catch(() => {});
      } catch {
        /* Unsupported schemes are denied. */
      }
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (new URL(url).origin !== origin) event.preventDefault();
    });
    window.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    window.once("ready-to-show", () => window?.show());
    await window.loadURL(origin);
  };
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  ipcMain.handle(
    "gbot:request",
    async (event, operation: unknown, args: unknown) => {
      try {
        if (
          !window ||
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
        const request = validateOperation(operation, args);
        const a = request.args;
        let value: unknown;
        if (request.operation === "snapshot")
          value = await runtime.services.snapshot();
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
        } else if (request.operation === "desktop.installUpdate") {
          if (runtime.db.updateStatus !== "restart required")
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
                extensions: ["txt", "md", "csv", "png", "jpg", "jpeg", "webp"],
              },
            ],
          });
          value = [];
          if (!result.canceled) {
            if (result.filePaths.length > 5)
              throw new DomainError("CAPABILITY", "Select at most five files.");
            value = await Promise.all(
              result.filePaths.map(async (path) => {
                if ((await stat(path)).size > 10 * 1024 * 1024)
                  throw new DomainError(
                    "CAPABILITY",
                    "Maximum file size is 10 MB.",
                  );
                return runtime.attachments.ingest(
                  path.split(/[\\/]/).at(-1)!,
                  "text/plain",
                  await readFile(path),
                );
              }),
            );
          }
        } else if (request.operation === "attachments.process") {
          const f = a[0] as { name: string; type: string; bytes: number[] };
          value = runtime.attachments.ingest(
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
      }
    },
  );
  runtime.services.subscribe(() => {
    if (window && !window.isDestroyed())
      window.webContents.send("gbot:changed");
  });
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
                if (preferences) {
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
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "togglefullscreen" },
        ],
      },
    ]),
  );
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    shuttingDown = true;
    runtime.engine.stopAll();
    void runtime.save().finally(() => {
      server.close();
      app.quit();
    });
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
void boot().catch(() => {
  void diagnostics?.record("startup_failure", "PERSISTENCE");
  dialog.showErrorBox(
    "G-Bot could not start",
    "Check local storage access and reinstall the application if needed. No credentials were exposed.",
  );
  app.quit();
});
