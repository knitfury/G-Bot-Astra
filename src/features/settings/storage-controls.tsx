"use client";
import { useState } from "react";
import { desktopCall } from "@/services/desktop/client";
import { useAction, useSnapshot } from "@/hooks/use-services";
import { Button } from "@/components/ui/button";
import { ErrorState, Notice } from "@/components/common/ui";
export function StorageControls() {
  const { data } = useSnapshot(),
    action = useAction(),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [usage, setUsage] = useState("");
  const run = (
    op:
      | "usage"
      | "clear-cache"
      | "clear-activity"
      | "backup"
      | "restore"
      | "json"
      | "markdown",
  ) =>
    void action
      .mutateAsync(async () => {
        const r = await desktopCall("desktop.data", op, password);
        if (r.message) setMessage(r.message);
        if (r.bytes !== undefined)
          setUsage(
            `${(r.bytes / 1024 / 1024).toFixed(1)} MB stored · ${((r.freeBytes ?? 0) / 1024 / 1024 / 1024).toFixed(1)} GB free${r.lowDisk ? " · Low disk space: free storage before continuing." : ""}`,
          );
        if (op === "backup" || op === "restore") setPassword("");
      })
      .catch(() => {});
  return (
    <div className="panel stack">
      <h2>Storage & backup</h2>
      <p>
        History is encrypted on this device. Backups use a separate password
        that only you know.
      </p>
      <div className="row wrap">
        <Button onClick={() => run("usage")}>Check storage usage</Button>
        <Button onClick={() => run("clear-cache")}>
          Clear temporary context
        </Button>
        <Button onClick={() => run("clear-activity")}>
          Clear Activity only
        </Button>
      </div>
      {usage && <p>{usage}</p>}
      <label className="field">
        Keep conversation history
        <select
          value={data?.preferences.historyRetention ?? 0}
          onChange={(e) =>
            void action
              .mutateAsync(() =>
                desktopCall(
                  "desktop.retention",
                  Number(e.target.value) as 0 | 30 | 90 | 180,
                ),
              )
              .catch(() => {})
          }
        >
          <option value={0}>Until I delete it</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
        </select>
      </label>
      <Notice>
        Changing retention immediately removes older conversations and their
        approvals. Export a backup first if you need to keep them. Activity is
        cleared separately.
      </Notice>
      <label className="field">
        Backup password
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={12}
        />
        <span className="field-help">
          At least 12 characters. There is no cloud recovery or backdoor.
        </span>
      </label>
      <div className="row wrap">
        <Button
          disabled={action.isPending || password.length < 12}
          onClick={() => run("backup")}
        >
          Create encrypted backup
        </Button>
        <Button
          disabled={action.isPending || !password}
          onClick={() => run("restore")}
        >
          Restore encrypted backup
        </Button>
      </div>
      <div className="row wrap">
        <Button onClick={() => run("json")}>Export JSON history</Button>
        <Button onClick={() => run("markdown")}>Export Markdown history</Button>
      </div>
      <p className="tiny muted">
        Readable exports exclude credential stores and tokens but contain your
        conversation content. Share carefully.
      </p>
      <p role="status">{message}</p>
      {action.error && <ErrorState message={action.error.message} />}
    </div>
  );
}
