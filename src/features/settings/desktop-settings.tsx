"use client";
import { useState } from "react";
import type { Database } from "@/types/domain";
import { useAction } from "@/hooks/use-services";
import { services } from "@/services";
import { desktopCall } from "@/services/desktop/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, ErrorState, Notice } from "@/components/common/ui";
export function DesktopSettings({
  tab,
  data,
}: {
  tab: string;
  data: Database;
}) {
  const action = useAction(),
    [clear, setClear] = useState(false);
  const run = (fn: () => Promise<unknown>) =>
    void action.mutateAsync(fn).catch(() => {});
  return (
    <div className="panel stack">
      <h2>{tab}</h2>
      {tab === "Security & Privacy" ? (
        <>
          <p>
            Credentials are encrypted using your operating system’s secure
            storage. Conversations and workspace preferences are saved in this
            device’s application data folder.
          </p>
          <Notice>
            Prompts, selected attachments and necessary tool results are sent
            directly to your selected AI provider. Tool requests go directly to
            your configured MCP servers. G-Bot does not proxy this business
            traffic.
          </Notice>
          <p>
            Local conversation files are not a substitute for full-disk
            encryption. Protect your operating-system account and device
            backups.
          </p>
          <Button onClick={() => setClear(true)}>
            Remove stored credentials
          </Button>
          <Dialog
            open={clear}
            onOpenChange={setClear}
            title="Remove all stored credentials?"
            description="This disconnects your AI providers and MCP servers. Saved configuration and conversations remain."
          >
            <Button
              variant="destructive"
              disabled={action.isPending}
              onClick={() =>
                run(async () => {
                  await services.secureStorage.clear();
                  setClear(false);
                })
              }
            >
              Remove credentials
            </Button>
          </Dialog>
        </>
      ) : tab === "Advanced" ? (
        <>
          <Badge>Local-first runtime</Badge>
          <p>
            Provider and MCP requests run in the trusted desktop process. Tool
            discovery never enables new permissions automatically. Consequential
            actions require approval.
          </p>
          <p>
            Plan controls currently use development entitlements. They are not a
            paid licensing or anti-tampering system. Use Account to test Free
            (1), Starter (5), and Business (8) connection limits.
          </p>
          <p>
            For the isolated deterministic demo, launch with{" "}
            <code>npm run desktop:demo</code> or use the browser version. No
            paid keys are needed there.
          </p>
        </>
      ) : (
        <>
          <Badge>Version {data.runtime?.version}</Badge>
          <h3>Application updates</h3>
          <p role="status">
            {data.updateStatus === "idle"
              ? "Check for signed releases when running an installed build."
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
                variant="default"
                onClick={() => run(() => desktopCall("desktop.installUpdate"))}
              >
                Restart and install
              </Button>
            )}
          </div>
          <p className="tiny">
            Unsigned development builds cannot update. Release signing, macOS
            notarization, and a published update feed must be configured by the
            owner.
          </p>
        </>
      )}
      {action.error && <ErrorState message={action.error.message} />}
    </div>
  );
}
