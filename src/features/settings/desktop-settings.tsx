"use client";
import { StorageControls } from "./storage-controls";
import { useState } from "react";
import Link from "next/link";
import type { Database } from "@/types/domain";
import { useAction } from "@/hooks/use-services";
import { services } from "@/services";
import { desktopCall } from "@/services/desktop/client";
import { Button } from "@/components/ui/button";
import { AsyncCheckbox } from "@/components/ui/async-checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Badge, ErrorState, Notice, Logo } from "@/components/common/ui";
export function DesktopSettings({
  tab,
  data,
}: {
  tab: string;
  data: Database;
}) {
  const action = useAction(),
    [confirm, setConfirm] = useState<"history" | "credentials" | null>(null),
    [report, setReport] = useState("");
  const run = (fn: () => Promise<unknown>) =>
    void action.mutateAsync(fn).catch(() => {});
  const controls = (
    <div className="panel stack">
      <h2>Local data controls</h2>
      <div className="settings-row">
        <div>
          <h3>Clear conversation history</h3>
          <p>
            Remove local conversations, approvals and activity. Keep your
            connections, credentials and preferences.
          </p>
        </div>
        <Button onClick={() => setConfirm("history")}>Clear history</Button>
      </div>
      <div className="settings-row">
        <div>
          <h3>Remove all credentials</h3>
          <p>
            Disconnect AI providers and apps. Keep saved configuration and
            history.
          </p>
        </div>
        <Button onClick={() => setConfirm("credentials")}>
          Remove credentials
        </Button>
      </div>
      <label className="settings-row">
        <span>
          <strong>Show activity history</strong>
          <p>Hide or show Activity without deleting retained records.</p>
        </span>
        <AsyncCheckbox
          role="switch"
          aria-label="Show activity history"
          checked={data.preferences.activityVisible}
          onCheckedChange={(v) =>
            action.mutateAsync(() =>
              services.account.preferences({ activityVisible: v }),
            )
          }
        />
      </label>
      <div className="settings-row">
        <div>
          <h3>Explore Demo Mode</h3>
          <p>
            A separate simulated workspace with realistic business snapshots and
            failure/recovery controls. Resetting its data never changes this
            workspace.
          </p>
        </div>
        <Button onClick={() => run(() => desktopCall("desktop.openDemo"))}>
          Open Demo
        </Button>
      </div>
    </div>
  );
  return (
    <div className="stack">
      {tab === "Security & Privacy" ? (
        <>
          <div className="panel stack">
            <h2>Clear boundaries. Your control.</h2>
            <p>
              Provider and app credentials are protected by your operating
              system. Your business context stays under your control.
            </p>
            <Notice>
              Prompts, selected attachments and necessary tool results go
              directly to your selected AI provider. App requests go directly to
              your authorized MCP servers. Account and billing services receive
              account metadata, not your conversations.
            </Notice>
            <p>
              New tools start disabled. Read tools require your permission;
              sending, changing or deleting business records requires your
              approval immediately before execution.
            </p>
            <Link className="text-link" href="/connections">
              Review tool permissions
            </Link>
            <Link className="text-link" href="/portal">
              Account security & MFA
            </Link>
          </div>
          {controls}
        </>
      ) : tab === "Advanced" ? (
        <>
          {controls}
          <StorageControls />
          <div className="panel stack">
            <h2>Custom integrations</h2>
            <p>
              Connect your own AI endpoint or compatible remote MCP server.
              Credentials stay protected on this device.
            </p>
            <Link className="text-link" href="/providers">
              Configure a custom provider
            </Link>
            <Link className="text-link" href="/connections">
              Inspect MCP details
            </Link>
          </div>
          <div className="panel stack">
            <h2>Sanitized diagnostics</h2>
            <label className="settings-row">
              <span>
                <strong>Share optional diagnostics</strong>
                <p>
                  Send only sanitized error categories and app/platform
                  metadata. No business content or credentials.
                </p>
              </span>
              <AsyncCheckbox
                role="switch"
                aria-label="Share optional diagnostics"
                checked={data.preferences.diagnosticsConsent === true}
                onCheckedChange={(v) =>
                  action.mutateAsync(() =>
                    services.account.preferences({ diagnosticsConsent: v }),
                  )
                }
              />
            </label>
            <p>
              Inspect a support report before sharing it. Reports exclude
              conversations, attachments, app data and credentials.
            </p>
            <Button
              onClick={() =>
                run(async () => {
                  setReport(await desktopCall("desktop.diagnostics"));
                })
              }
            >
              Inspect diagnostics
            </Button>
            {report && (
              <>
                <pre className="code">{report}</pre>
                <Button
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([report], { type: "application/json" }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "gbot-diagnostics.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export diagnostics
                </Button>
              </>
            )}
            <a className="text-link" href="mailto:gbot@vidinex.ee">
              Contact G-Bot Support
            </a>
          </div>
        </>
      ) : (
        <div className="panel stack">
          <Logo />
          <h2>G-Bot</h2>
          <p>
            Ask once. G-Bot works across your business and gets the task done.
          </p>
          <div className="row wrap">
            <Badge>Version {data.runtime?.version}</Badge>
            <Badge>Stable channel</Badge>
          </div>
          <div className="divider" />
          <h3>Application updates</h3>
          <p role="status">
            {data.updateStatus === "idle"
              ? "You control when updates are downloaded and installed."
              : data.updateStatus}
          </p>
          {data.runtime?.updateError && (
            <ErrorState message={data.runtime.updateError} />
          )}
          <div className="row wrap">
            <Button
              disabled={action.isPending || data.updateStatus === "downloading"}
              onClick={() => run(() => services.updates.check())}
            >
              Check for updates
            </Button>
            {data.updateStatus === "available" && (
              <Button onClick={() => run(() => services.updates.download())}>
                Download update
              </Button>
            )}
            {data.updateStatus === "restart required" && (
              <Button
                onClick={() => run(() => desktopCall("desktop.installUpdate"))}
              >
                Restart and install
              </Button>
            )}
          </div>
          <div className="divider" />
          <div className="row wrap">
            <Link className="text-link" href="/g-bot/support">
              Help & Support
            </Link>
            <Link className="text-link" href="/g-bot/privacy">
              Privacy
            </Link>
            <Link className="text-link" href="/g-bot/terms">
              Terms
            </Link>
            <Link className="text-link" href="/g-bot/notices">
              Open-source notices
            </Link>
          </div>
          <p className="tiny muted">
            Vidinex E-Commerce OÜ · Registry code 17603412 · Estonia
          </p>
        </div>
      )}
      {action.error && <ErrorState message={action.error.message} />}
      <Dialog
        open={!!confirm}
        onOpenChange={() => setConfirm(null)}
        title={
          confirm === "history"
            ? "Clear local history?"
            : "Remove all stored credentials?"
        }
        description={
          confirm === "history"
            ? "This permanently removes local conversations, approvals and activity. Connections and credentials remain."
            : "This disconnects providers and apps. Saved configuration and history remain."
        }
      >
        <div className="form-actions">
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={action.isPending}
            onClick={() =>
              run(async () => {
                if (confirm === "history")
                  await services.account.clearHistory();
                else await services.secureStorage.clear();
                setConfirm(null);
              })
            }
          >
            {confirm === "history" ? "Clear history" : "Remove credentials"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
