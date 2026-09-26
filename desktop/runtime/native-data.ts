import { exportAudit } from "../../src/lib/audit";
import { auditAvailable } from "../../src/lib/entitlements";
import { dialog } from "electron";
import {
  stat,
  statfs,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Runtime } from "./service";
import { databaseShape } from "./service";
import { createBackup, restoreBackup } from "./encrypted";
import { exportHistory, portableData, retain } from "./data-controls";
export async function nativeData(
  runtime: Runtime,
  directory: string,
  action: string,
  password: string,
) {
  if (action === "audit") {
    const content = exportAudit(runtime.db);
    const file = await dialog.showSaveDialog({
      title: "Export local Activity & Audit",
      defaultPath: "g-bot-audit.json",
    });
    if (file.canceled || !file.filePath) return { cancelled: true };
    await writeFile(file.filePath, content, { mode: 0o600 });
    return {
      message:
        "Local audit exported. It may contain private business metadata; share carefully.",
    };
  }
  if (action === "audit-retention") {
    if (!auditAvailable(runtime.db.entitlement))
      throw Error("Advanced Activity & Audit requires Business.");
    const days = Number(password);
    if (![0, 30, 90, 180].includes(days))
      throw Error("Invalid retention period.");
    if (days) {
      const choice = await dialog.showMessageBox({
        type: "warning",
        buttons: ["Cancel", "Apply retention"],
        defaultId: 0,
        cancelId: 0,
        message: `Delete Activity older than ${days} days?`,
        detail:
          "Conversation history and approval records remain. Export your audit first if you need to keep these events.",
      });
      if (choice.response !== 1) return { cancelled: true };
    }
    runtime.db.preferences.activityRetention = days as 0 | 30 | 90 | 180;
    await runtime.save();
    return { message: "Activity retention updated." };
  }
  if (action === "usage") {
    const files = await readdir(directory);
    let bytes = 0;
    for (const f of files) {
      const s = await stat(join(directory, f));
      if (s.isFile()) bytes += s.size;
    }
    const disk = await statfs(directory);
    return {
      bytes,
      freeBytes: disk.bavail * disk.bsize,
      lowDisk: disk.bavail * disk.bsize < 500 * 1024 * 1024,
    };
  }
  if (action === "clear-cache") {
    runtime.attachments.clear();
    runtime.snapshots.clear();
    return { message: "Temporary attachment and snapshot context cleared." };
  }
  if (action === "clear-activity") {
    const answer = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Cancel", "Clear Activity"],
      defaultId: 0,
      cancelId: 0,
      message: "Clear local Activity?",
      detail: "Conversation history, credentials and configuration remain.",
    });
    if (answer.response !== 1) return { cancelled: true };
    runtime.db.activity = [];
    await runtime.save();
    return { message: "Activity cleared." };
  }
  if (action === "backup" || action === "json" || action === "markdown") {
    const backup = action === "backup",
      file = await dialog.showSaveDialog({
        title: backup
          ? "Save encrypted backup"
          : "Export readable conversation history",
        defaultPath: backup
          ? "g-bot-backup.gbot"
          : `g-bot-history.${action === "json" ? "json" : "md"}`,
      });
    if (file.canceled || !file.filePath) return { cancelled: true };
    const content = backup
      ? await createBackup(portableData(runtime.db), password)
      : exportHistory(runtime.db, action);
    const tmp = `${file.filePath}.${randomUUID()}.tmp`;
    await writeFile(tmp, content, { mode: 0o600 });
    await rename(tmp, file.filePath);
    return {
      message: backup
        ? "Encrypted backup saved. Store its password separately; G-Bot cannot recover it."
        : "Readable history exported. It can contain private conversation content; share carefully.",
    };
  }
  if (action === "restore") {
    const file = await dialog.showOpenDialog({
      title: "Restore encrypted backup",
      properties: ["openFile"],
      filters: [{ name: "G-Bot backup", extensions: ["gbot"] }],
    });
    if (file.canceled) return { cancelled: true };
    if ((await stat(file.filePaths[0])).size > 300_000_000)
      throw Error("Backup exceeds safe restore limit.");
    const restored = await restoreBackup(
      await readFile(file.filePaths[0], "utf8"),
      password,
      databaseShape,
    );
    const confirmation = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Cancel", "Restore backup"],
      defaultId: 0,
      cancelId: 0,
      message: "Replace this local workspace with the verified backup?",
      detail:
        "Your account identity is retained. Export a backup of your current history first. Restored providers and apps must be reconnected.",
    });
    if (confirmation.response !== 1) return { cancelled: true };
    runtime.engine.stopAll();
    const prior = runtime.db;
    restored.user = prior.user;
    restored.entitlement = prior.entitlement;
    restored.runtime = prior.runtime;
    for (const c of prior.connections) await runtime.mcp.disconnect(c.id);
    runtime.db = restored;
    try {
      await runtime.save();
      runtime.attachments.clear();
      runtime.snapshots.clear();
    } catch (e) {
      runtime.db = prior;
      throw e;
    }
    return {
      message:
        "Backup restored. Reconnect providers and apps before using them.",
    };
  }
  throw Error("Unsupported data operation");
}
export async function applyRetention(
  runtime: Runtime,
  days: 0 | 30 | 90 | 180,
  confirm = false,
) {
  if (confirm && days !== 0) {
    const choice = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Cancel", "Apply retention"],
      defaultId: 0,
      cancelId: 0,
      message: `Delete conversations older than ${days} days?`,
      detail:
        "This permanently removes matching local history. Export a backup first if you want to keep it.",
    });
    if (choice.response !== 1) return;
  }
  const prior = runtime.db;
  runtime.engine.stopAll();
  runtime.db = retain(prior, days);
  runtime.db.preferences.historyRetention = days;
  try {
    await runtime.save();
    runtime.attachments.clear();
    runtime.snapshots.clear();
  } catch (e) {
    runtime.db = prior;
    throw e;
  }
}
