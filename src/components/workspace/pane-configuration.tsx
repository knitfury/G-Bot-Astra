"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { desktopCall } from "@/services/desktop/client";
import { useAction } from "@/hooks/use-services";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/common/ui";
import {
  snapshotKinds,
  type SnapshotConfig,
  type SnapshotKind,
} from "@/types/snapshot";
import type { MCPConnection } from "@/types/domain";
export function PaneConfiguration({
  connection,
}: {
  connection: MCPConnection;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(""),
    [args, setArgs] = useState(
      JSON.stringify(connection.snapshotConfig?.arguments ?? {}, null, 2),
    ),
    [kind, setKind] = useState<SnapshotKind>(
      connection.snapshotConfig?.kind ?? "generic",
    ),
    [fields, setFields] = useState<NonNullable<SnapshotConfig["fields"]>>(
      connection.snapshotConfig?.fields ?? {},
    ),
    [consent, setConsent] = useState(false),
    [error, setError] = useState("");
  const action = useAction();
  const sources = useQuery({
    queryKey: ["pane-sources", connection.id, connection.tools],
    queryFn: () => desktopCall("desktop.paneSources", connection.id),
    enabled: open,
    retry: false,
  });
  const source = sources.data?.find(
    (s) => `${s.source}:${s.name}` === selected,
  );
  async function save(reset = false) {
    try {
      setError("");
      if (!reset && (!source?.eligible || !consent)) return;
      await action.mutateAsync(() =>
        desktopCall(
          "desktop.configurePane",
          connection.id,
          reset
            ? null
            : {
                endpoint: connection.url,
                source: source!.source,
                name: source!.name,
                binding: source!.binding,
                kind,
                arguments: JSON.parse(args),
                fields,
              },
        ),
      );
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save pane configuration.",
      );
    }
  }
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Configure pane
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Business context · ${connection.name}`}
      >
        <div className="stack">
          <p>
            Read directly from this MCP server without an AI provider. Choose a
            source you trust for automatic read-only access. Write and
            destructive tools cannot be used here.
          </p>
          {sources.isPending && <p role="status">Discovering read sources…</p>}
          {sources.error && (
            <ErrorState
              message={sources.error.message}
              retry={() => void sources.refetch()}
            />
          )}
          <label className="field">
            Read source
            <select
              aria-label="Read source"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setConsent(false);
              }}
            >
              <option value="">Choose a source</option>
              {sources.data?.map((s) => (
                <option
                  key={`${s.source}:${s.name}`}
                  value={`${s.source}:${s.name}`}
                  disabled={!s.eligible}
                >
                  {s.label} · {s.source}
                  {!s.eligible ? " · unavailable" : ""}
                </option>
              ))}
            </select>
          </label>
          {sources.data
            ?.filter((s) => !s.eligible)
            .map((s) => (
              <p key={s.name} className="tiny muted">
                {s.label}: {s.reason}
              </p>
            ))}
          {source && (
            <>
              <p>{source.reason}</p>
              {source.template && (
                <p>
                  Resource template: <code>{source.name}</code>. Supply its
                  named parameters below.
                </p>
              )}
              {source.inputSchema && (
                <details>
                  <summary>Required parameters and schema</summary>
                  <pre className="code">
                    {JSON.stringify(source.inputSchema, null, 2)}
                  </pre>
                </details>
              )}
              <label className="field">
                Parameters (JSON)
                <textarea
                  aria-label="Parameters (JSON)"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  rows={5}
                  spellCheck={false}
                />
                <span className="tiny">
                  Use account, folder or query values required by this source.
                  Never enter passwords, tokens or API keys here; authentication
                  uses the secure connection settings.
                </span>
              </label>
              <label className="field">
                Presentation
                <select
                  aria-label="Presentation"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as SnapshotKind)}
                >
                  {snapshotKinds.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <details>
                <summary>Optional field mapping</summary>
                <p className="tiny">
                  Use dot-separated field paths. Leave blank for automatic
                  structured-data detection.
                </p>
                {(["rows", "title", "subtitle", "preview"] as const).map(
                  (k) => (
                    <label className="field" key={k}>
                      {k}
                      <input
                        value={fields[k] ?? ""}
                        onChange={(e) =>
                          setFields({ ...fields, [k]: e.target.value })
                        }
                      />
                    </label>
                  ),
                )}
              </details>
              <label className="row">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I trust this source for automatic read-only pane requests.
              </label>
            </>
          )}
          {error && <ErrorState message={error} />}
          <div className="form-actions">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={action.isPending} onClick={() => void save(true)}>
              Use automatic detection
            </Button>
            <Button
              variant="default"
              disabled={!source?.eligible || !consent || action.isPending}
              onClick={() => void save()}
            >
              Save pane source
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
