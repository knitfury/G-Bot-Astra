"use client";
import { isObject } from "@/lib/context-inference";
import {
  choiceRecordPath,
  parameterFields,
  requiresAdvancedParameters,
  parameterValue,
  setParameter,
  validateParameterInputs,
} from "@/lib/context-parameters";
import type { SnapshotSource, ParameterChoices } from "@/types/snapshot";
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
    [selected, setSelected] = useState(
      connection.snapshotConfig
        ? `${connection.snapshotConfig.source}:${connection.snapshotConfig.name}`
        : "",
    ),
    [filter, setFilter] = useState(""),
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(args);
  } catch {
    parsed = undefined;
  }
  const validation = validateParameterInputs(source?.inputSchema, parsed);
  async function save(reset = false) {
    try {
      setError("");
      if (!reset && (!source?.eligible || !consent || !validation.valid))
        return;
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
                const next = sources.data?.find(
                  (s) => `${s.source}:${s.name}` === e.target.value,
                );
                const saved =
                  connection.snapshotConfig?.name === next?.name &&
                  connection.snapshotConfig?.binding === next?.binding
                    ? connection.snapshotConfig
                    : undefined;
                setArgs(
                  JSON.stringify(
                    saved?.arguments ?? next?.arguments ?? {},
                    null,
                    2,
                  ),
                );
                setKind(saved?.kind ?? next?.kind ?? "generic");
                setFields(saved?.fields ?? next?.defaults?.fields ?? {});
                setConsent(false);
              }}
            >
              <option value="">Choose a source</option>
              {([false, true] as const).map((needs) => (
                <optgroup
                  key={String(needs)}
                  label={needs ? "Choose required values" : "Ready to read"}
                >
                  {sources.data
                    ?.filter(
                      (s) =>
                        s.eligible &&
                        (s.readiness === "configuration" ||
                          !!s.needs?.length) === needs,
                    )
                    .map((s) => (
                      <option
                        key={`${s.source}:${s.name}`}
                        value={`${s.source}:${s.name}`}
                      >
                        {s.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          {sources.data && !sources.data.some((s) => s.eligible) && (
            <div role="status">
              <h3>No trusted read source available</h3>
              <p>
                This server has not supplied an enabled, verified read source.
                Reconnect after enabling its retrieval tools, or share the
                sanitized discovery details with support. An AI provider is not
                required. Unverified tools cannot be approved for automatic pane
                access.
              </p>
            </div>
          )}
          <details>
            <summary>
              Advanced · blocked operations and security reasons (
              {sources.data?.filter((s) => !s.eligible).length ?? 0})
            </summary>
            <label className="field">
              Filter operations
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            {sources.data
              ?.filter(
                (s) =>
                  !s.eligible &&
                  s.label.toLowerCase().includes(filter.toLowerCase()),
              )
              .map((s) => (
                <p key={`${s.source}:${s.name}`} className="tiny muted">
                  {s.label}: {s.reason}
                </p>
              ))}
          </details>
          {source && (
            <>
              <p>{source.reason}</p>
              {source.authority && (
                <p className="tiny">
                  Trust basis:{" "}
                  {source.authority === "signed-catalog"
                    ? "G-Bot signed catalog · reviewed arguments only"
                    : "MCP server declaration · trust this server before enabling automatic access"}
                </p>
              )}
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
              <ParameterFields
                key={selected + source.binding}
                schema={source.inputSchema}
                value={args}
                change={setArgs}
                connectionId={connection.id}
                source={source}
                sources={sources.data ?? []}
                consent={consent}
              />
              {requiresAdvancedParameters(source.inputSchema) && (
                <details>
                  <summary>Advanced parameters (JSON)</summary>
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
                      Use account, folder or query values required by this
                      source. Never enter passwords, tokens or API keys here;
                      authentication uses the secure connection settings.
                    </span>
                  </label>
                </details>
              )}
              {!validation.valid && (
                <div role="status">
                  <p>Complete the required values before saving.</p>
                  {validation.issues.map((issue, i) => (
                    <p className="tiny" key={i}>
                      {issue.message}
                    </p>
                  ))}
                </div>
              )}
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
              disabled={
                !source?.eligible ||
                !consent ||
                !validation.valid ||
                action.isPending
              }
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

function ParameterFields({
  schema,
  value,
  change,
  connectionId,
  source,
  sources,
  consent,
}: {
  schema?: Record<string, unknown>;
  value: string;
  change: (v: string) => void;
  connectionId: string;
  source: SnapshotSource;
  sources: SnapshotSource[];
  consent: boolean;
}) {
  const [loaded, setLoaded] = useState<Record<string, ParameterChoices>>({});
  const [loading, setLoading] = useState("");
  let values: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(value);
    if (isObject(parsed)) values = parsed;
  } catch {}
  const update = (path: string, v: unknown) =>
    change(JSON.stringify(setParameter(values, path, v), null, 2));
  async function load(path: string, discovery: SnapshotSource) {
    setLoading(path);
    const key = `${source.source}:${source.name}` + ":" + path;
    try {
      const result = await desktopCall(
        "desktop.paneChoices",
        connectionId,
        `${source.source}:${source.name}`,
        path,
        `${discovery.source}:${discovery.name}`,
        consent,
      );
      setLoaded((old) => ({ ...old, [key]: result }));
    } catch {
      setLoaded((old) => ({
        ...old,
        [key]: {
          choices: [],
          message:
            "Could not load choices. Check this connection’s permissions and try again, or enter a known value.",
        },
      }));
    } finally {
      setLoading("");
    }
  }
  return (
    <div className="stack">
      {parameterFields(schema).map((field) => {
        const p = field.schema,
          current = parameterValue(values, field.path);
        const options = Array.isArray(p.enum)
          ? p.enum
              .filter((x) => ["string", "number", "boolean"].includes(typeof x))
              .slice(0, 100)
          : undefined;
        const result =
          loaded[`${source.source}:${source.name}` + ":" + field.path];
        const discovery = sources.filter(
          (s) =>
            `${s.source}:${s.name}` !== `${source.source}:${source.name}` &&
            s.eligible &&
            s.readiness === "ready" &&
            choiceRecordPath(s.outputSchema, field),
        );
        if (field.complex)
          return (
            <p key={field.path}>
              {field.label} requires a structured value in Advanced parameters.
            </p>
          );
        return (
          <div key={field.path} className="stack">
            <label className="field">
              {field.label}
              {field.required ? " (required)" : ""}
              {options || p.type === "boolean" ? (
                <select
                  aria-label={field.label}
                  value={String(current ?? "")}
                  onChange={(e) =>
                    update(
                      field.path,
                      e.target.value === ""
                        ? undefined
                        : options
                          ? options.find((x) => String(x) === e.target.value)
                          : e.target.value === "true",
                    )
                  }
                >
                  <option value="">Choose a value</option>
                  {(options ?? [true, false]).map((x) => (
                    <option key={String(x)} value={String(x)}>
                      {typeof x === "boolean" ? (x ? "Yes" : "No") : String(x)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={field.label}
                  type={p.type === "string" ? "text" : "number"}
                  value={String(current ?? "")}
                  min={typeof p.minimum === "number" ? p.minimum : undefined}
                  max={typeof p.maximum === "number" ? p.maximum : undefined}
                  step={p.type === "integer" ? 1 : "any"}
                  onChange={(e) =>
                    update(
                      field.path,
                      e.target.value === ""
                        ? undefined
                        : p.type === "string"
                          ? e.target.value
                          : Number(e.target.value),
                    )
                  }
                />
              )}
              {field.description && (
                <span className="tiny muted">{field.description}</span>
              )}
            </label>
            {!!discovery.length && (
              <div>
                <p className="tiny">
                  After confirming trust below, load choices from an enabled
                  read-only source. No value is selected automatically.
                </p>
                {discovery.slice(0, 3).map((s) => (
                  <Button
                    key={`${s.source}:${s.name}`}
                    size="sm"
                    disabled={!consent || !!loading}
                    onClick={() => void load(field.path, s)}
                  >
                    Load {field.label} choices from {s.label}
                  </Button>
                ))}
              </div>
            )}
            {result && (
              <div role="status">
                <p className="tiny">{result.message}</p>
                {!!result.choices.length && (
                  <select
                    aria-label={`${field.label} discovered choices`}
                    value=""
                    onChange={(e) => {
                      const choice = result.choices[Number(e.target.value)];
                      if (choice) update(field.path, choice.value);
                    }}
                  >
                    <option value="">Choose a discovered value</option>
                    {result.choices.map((c, i) => (
                      <option key={i} value={i}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
