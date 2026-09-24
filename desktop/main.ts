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
import {verifyUpdate,verifyInstaller,type UpdateManifest} from "./runtime/update-integrity";
import {SafeTelemetry} from "./runtime/telemetry";
import {CatalogClient} from "./runtime/catalog";
import {nativeData,applyRetention} from "./runtime/native-data";
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
  const directory = join(app.getPath("userData"), "real-v1");
  diagnostics = new Diagnostics(directory,new SafeTelemetry(process.env.GBOT_SENTRY_DSN,()=>runtime?.db.preferences.diagnosticsConsent===true));
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
  let verifiedManifest:UpdateManifest|undefined;
  const update = async (action: "check" | "download") => {
    if (!app.isPackaged)
      throw new DomainError(
        "CAPABILITY",
        "Updates require a signed packaged release and configured publishing feed.",
      );
    if(action==="check"){
      const manifestUrl=process.env.GBOT_RELEASE_MANIFEST_URL,keys=JSON.parse(process.env.GBOT_UPDATE_PUBLIC_KEYS??"{}");
      if(!manifestUrl||!Object.keys(keys).length)throw new DomainError("CAPABILITY","No verified release channel is configured yet.");
      const response=await fetch(externalURL(manifestUrl),{redirect:"error",signal:AbortSignal.timeout(15000)});if(!response.ok)throw new DomainError("NETWORK","Release information is unavailable. Try again later.");
      const raw=await response.text();if(raw.length>16000)throw Error("Invalid release manifest");
      verifiedManifest=verifyUpdate(JSON.parse(raw),keys,app.getVersion(),process.platform,process.arch);
      const result=await autoUpdater.checkForUpdates();if(result?.updateInfo.version!==verifiedManifest.version){verifiedManifest=undefined;throw new DomainError("CAPABILITY","Release feed does not match its signed manifest.");}
    }else{
      if(!verifiedManifest)throw new DomainError("CAPABILITY","Check for a verified update first.");
      const files=await autoUpdater.downloadUpdate();for(const file of files)await verifyInstaller(file,verifiedManifest);
      runtime.db.updateStatus="restart required";await runtime.save();
    }
  };
  await vault.init();
  const identity = new ProductionIdentity(vault, {
    supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL??"",anonKey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??"",
    controlOrigin:process.env.GBOT_CONTROL_PLANE_URL??"https://account.vidinex.ee",
    environment:process.env.NEXT_PUBLIC_GBOT_ENVIRONMENT==="production"?"production":process.env.NEXT_PUBLIC_GBOT_ENVIRONMENT==="staging"?"staging":"development",
    publicKeys:JSON.parse(process.env.GBOT_LICENSE_PUBLIC_KEYS??"{}"),version:"1.0.0",platform:process.platform==="darwin"?"darwin":"win32",
  },url=>shell.openExternal(externalURL(url)),async(license,user)=>{
    if(user)runtime.db.user=user;
    if(license){runtime.db.entitlement=entitlementFor(license.plan);runtime.db.entitlement.renewalAt=new Date(license.expiresAt).toISOString();}
    else runtime.db.entitlement.status="expired";
    await runtime.save();
  });
  const catalog=new CatalogClient(vault,process.env.GBOT_CONTROL_PLANE_URL??"https://account.vidinex.ee",JSON.parse(process.env.GBOT_CATALOG_PUBLIC_KEYS??"{}"));
  const inference=new HTTPInference();
  const guardedMcp={connect:async(...args:Parameters<typeof mcp.connect>)=>{await identity.ensure();return mcp.connect(...args);},disconnect:(id:string)=>mcp.disconnect(id),call:async(...args:Parameters<typeof mcp.call>)=>{await identity.ensure();return mcp.call(...args);}};
  runtime = new Runtime(
    new EncryptedStore(directory, "workspace.json", localDatabase, databaseShape,vault),
    vault,
    {generate:async(...args:Parameters<typeof inference.generate>)=>{await identity.ensure();return inference.generate(...args);}},
    guardedMcp,
    { check: () => update("check"), download: () => update("download") },
    identity,
  );
  await runtime.init();
  if(runtime.db.preferences.historyRetention)await applyRetention(runtime,runtime.db.preferences.historyRetention);
  const prefs = new EncryptedStore<string | null>(
    directory,
    "preferences.json",
    () => null,
    (v): v is string | null => v === null || typeof v === "string",
    vault,
  );
  let preferences = await prefs.read();
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
    await window.loadURL(origin + (runtime.db.user ? "/workspace" : "/"));
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
        else if (request.operation === "desktop.catalog") value=await catalog.get();
        else if (request.operation === "desktop.data") value=await nativeData(runtime,directory,a[0] as string,a[1] as string);
        else if (request.operation === "desktop.retention") value=await applyRetention(runtime,a[0] as 0|30|90|180);
        else if (request.operation === "desktop.signIn") value=await identity.browser(a[0] as "google"|"azure");
        else if (request.operation === "desktop.verifyMfa") value=await identity.mfa(a[0] as string);
        else if (request.operation === "desktop.refreshLicense") value=await identity.ensure(true);
        else if (request.operation === "desktop.openAccount") value=await shell.openExternal(externalURL((process.env.GBOT_CONTROL_PLANE_URL??"https://account.vidinex.ee")+"/portal"));
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
          const demo = new BrowserWindow({width:1440,height:1000,minWidth:390,minHeight:600,title:"G-Bot · Demo Mode",webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,partition:"persist:gbot-demo"}});
          demo.webContents.setWindowOpenHandler(()=>({action:"deny"}));
          demo.webContents.on("will-navigate",(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
          await demo.loadURL(origin);
        } else if (request.operation === "desktop.diagnostics") {
          value=JSON.stringify({format:"g-bot-support",version:app.getVersion(),platform:process.platform,architecture:process.arch,component:"desktop",credentialProtection:"OS secure storage",updateStatus:runtime.db.updateStatus},null,2);
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
                extensions: ["pdf", "docx", "xlsx", "txt", "md", "csv", "png", "jpg", "jpeg", "webp"],
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
