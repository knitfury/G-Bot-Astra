"use client";
import { CatalogBrowser } from "./catalog-browser";
import { useState } from "react";
import { AsyncCheckbox } from "@/components/ui/async-checkbox";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Lock,
  ArrowUpRight,
  ArrowLeft,
  ArrowClockwise,
  ShieldCheck,
  Plugs,
  Trash,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useAction, useSnapshot } from "@/hooks/use-services";
import { useDesktop } from "@/hooks/use-desktop";
import { services } from "@/services";
import {
  canActivate,
  activeConnectionCount,
  connectionAvailable,
} from "@/lib/entitlements";
import type { MCPConnection, Category } from "@/types/domain";
import {
  PageHeading,
  AppIcon,
  StatusBadge,
  Badge,
  Empty,
  ErrorState,
  Loading,
  Notice,
} from "@/components/common/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
export const appCategories: Category[] = [
  "Email",
  "CRM",
  "Inventory",
  "Accounting",
  "Helpdesk",
  "Calendar",
  "Documents",
  "Projects",
  "Ecommerce",
  "Shipping",
  "Logistics",
  "Custom",
];
const schema = z.object({
  name: z.string().min(2, "Enter a connection name."),
  url: z.url("Enter a valid MCP URL."),
  category: z.enum(appCategories as [Category, ...Category[]]),
  auth: z.enum(["OAuth", "Token", "None"]),
  token: z.string(),
  authHeader: z.string(),
  headers: z.string(),
  oauthClientId: z.string(),
});
type Values = z.infer<typeof schema>;
export function ConnectionForm({
  slot,
  connection,
  onDone,
}: {
  slot: number;
  connection?: MCPConnection;
  onDone: () => void;
}) {
  const action = useAction();
  const desktop = useDesktop();
  const [step, setStep] = useState<"configure" | "permission" | "complete">(
      "configure",
    ),
    [id, setId] = useState(connection?.id || ""),
    [consent, setConsent] = useState(false);
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: connection?.name || "",
      url: connection?.url || "https://demo.example.com/mcp",
      category: connection?.category || "Email",
      auth: connection?.auth || "OAuth",
      token: "",
      authHeader: connection?.authHeader || "Authorization",
      headers: "{}",
      oauthClientId: connection?.oauthClientId || "",
    },
  });
  async function save(v: Values) {
    if (!desktop && v.auth === "Token" && v.token.length < 8)
      throw new Error("Use a demo token with at least 8 characters.");
    const result = await services.connections.save(
      {
        name: v.name,
        url: v.url,
        category: v.category,
        auth: v.auth,
        slot,
        ...(desktop
          ? {
              token: v.token,
              authHeader: v.authHeader,
              headers: v.headers,
              oauthClientId: v.oauthClientId,
            }
          : {}),
      },
      connection?.id,
    );
    setId(result);
    setStep("permission");
  }
  return (
    <div className="stack">
      {step === "configure" ? (
        <form
          className="stack"
          onSubmit={handleSubmit(
            (v) => void action.mutateAsync(() => save(v)).catch(() => {}),
          )}
          noValidate
        >
          <div className="form-grid">
            <label className="field">
              Connection name
              <input {...register("name")} placeholder="My business email" />
              {errors.name && (
                <span className="field-error">{errors.name.message}</span>
              )}
            </label>
            <label className="field">
              Business category
              <select {...register("category")}>
                {appCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            MCP server URL
            <input {...register("url")} />
            {errors.url && (
              <span className="field-error">{errors.url.message}</span>
            )}
            <span className="field-help">
              {desktop
                ? "Enter a remote MCP Streamable HTTP endpoint. HTTPS is required; loopback HTTP is allowed for development."
                : "Any HTTP(S) endpoint is simulated. Include “fail” in the URL to test recovery."}
            </span>
          </label>
          <label className="field">
            Authentication
            <select {...register("auth")}>
              <option>OAuth</option>
              <option>Token</option>
              <option>None</option>
            </select>
          </label>
          {watch("auth") === "Token" && (
            <label className="field">
              {desktop ? "Token / API key" : "Demo token"}
              <input
                {...register("token")}
                type="password"
                autoComplete="off"
                placeholder={desktop ? "Enter credential" : "demo-token-1234"}
              />
              <span className="field-help">
                {desktop
                  ? "Encrypted using your operating system’s credential protection."
                  : "Demo tokens are discarded. Do not use a real credential."}
              </span>
            </label>
          )}
          {desktop && (
            <>
              {watch("auth") === "Token" && (
                <label className="field">
                  Authentication header
                  <input {...register("authHeader")} />
                  <span className="field-help">
                    Authorization adds Bearer automatically; use x-api-key for
                    API keys.
                  </span>
                </label>
              )}
              {watch("auth") === "OAuth" && (
                <label className="field">
                  OAuth client ID (optional)
                  <input {...register("oauthClientId")} />
                  <span className="field-help">
                    Use a registered public client if the server does not
                    support dynamic registration. Callback:
                    http://127.0.0.1:43827/oauth/callback
                  </span>
                </label>
              )}
              <label className="field">
                Custom headers (JSON, securely stored)
                <textarea {...register("headers")} />
              </label>
            </>
          )}
          <div className="form-actions">
            <Button type="submit" variant="default" disabled={action.isPending}>
              {action.isPending
                ? "Saving configuration…"
                : "Continue to permissions"}
              <ArrowUpRight size={15} />
            </Button>
          </div>
        </form>
      ) : step === "permission" ? (
        <>
          <div className="permission-visual">
            <ShieldCheck size={40} weight="duotone" />
            <h3>Choose what G-Bot can do.</h3>
            <p>
              G-Bot can read {watch("category").toLowerCase()} context and
              prepare changes. Every consequential action needs your approval.
            </p>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Allow this connection to discover its tools.
          </label>
          {watch("auth") === "OAuth" && (
            <Notice>
              {desktop
                ? "Your browser will open the server’s authorization page. Return here after consent. Newly discovered tools remain disabled until you review them."
                : "OAuth simulation: approving here represents the provider consent screen. No external sign-in occurs."}
            </Notice>
          )}
          <div className="form-actions">
            <Button
              onClick={() => setStep("configure")}
              disabled={action.isPending}
            >
              Back
            </Button>
            <Button
              variant="default"
              disabled={!consent || action.isPending}
              onClick={() =>
                void action
                  .mutateAsync(() => services.connections.connect(id, consent))
                  .then(() => setStep("complete"))
                  .catch(() => {})
              }
            >
              {action.isPending
                ? "Authenticating & discovering tools…"
                : action.error
                  ? "Retry connection"
                  : watch("auth") === "OAuth"
                    ? desktop
                      ? "Authorize connection"
                      : "Authorize demo connection"
                    : "Connect app"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="permission-visual">
            <CheckCircle size={44} weight="duotone" />
            <h3>{watch("name")} is connected.</h3>
            <p>
              {desktop
                ? "Open this connection’s Tools tab to review and enable discovered tools. New tools are disabled by default."
                : "Your app is ready to provide context. Inspect its discovered tools and permissions at any time."}
            </p>
          </div>
          <Button variant="default" onClick={onDone}>
            Done
          </Button>
        </>
      )}
      {action.error && <ErrorState message={action.error.message} />}
    </div>
  );
}
export function ConnectionManager({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { data } = useSnapshot();
  const [slot, setSlot] = useState<number>();
  const [source, setSource] = useState("Custom MCP");
  if (!data) return <Loading />;
  const active = activeConnectionCount(data.connections);
  const add = () =>
    setSlot(Math.max(-1, ...data.connections.map((c) => c.slot)) + 1);
  return (
    <div className={embedded ? "stack" : "page"}>
      {!embedded ? (
        <PageHeading
          eyebrow="WORK BETTER, TOGETHER"
          title="Your Connections"
          description="Connect the business tools you want G-Bot to work with."
        >
          <Badge tone="accent">
            {active} / {data.entitlement.maxActiveConnections} active
          </Badge>
        </PageHeading>
      ) : (
        <>
          <h2>Give G-Bot the right context.</h2>
          <p>
            Connect your first business app. You can add more or change apps
            later.
          </p>
        </>
      )}
      <Button variant="default" onClick={add}>
        <Plus size={16} />
        Add Connection
      </Button>
      <div className="connection-summary">
        <div className="row">
          <Plugs size={20} />
          <span>
            <strong className="capitalize">{data.entitlement.plan}</strong> plan
            · {active} of {data.entitlement.maxActiveConnections} active
            connection
            {data.entitlement.maxActiveConnections === 1 ? "" : "s"}
          </span>
        </div>
        <Link className="text-link tiny" href="/account">
          Compare plans <ArrowUpRight size={12} />
        </Link>
      </div>

      {!data.connections.length && (
        <Empty
          title="Your Connections"
          description="Connect the business tools you want G-Bot to work with."
        />
      )}
      <div className="connection-grid">
        {data.connections.map((c) => (
          <article className="connection-card" key={c.id}>
            <div className="row between">
              <AppIcon category={c.category} />
              <StatusBadge status={c.status} />
            </div>
            <h3>{c.name}</h3>
            <p>{c.category}</p>
            <p className="slot-detail">
              {c.tools.filter((t) => t.enabled).length} authorized /{" "}
              {c.tools.length} discovered tools · {c.auth}
            </p>
            {c.error && <p role="status">{c.error}</p>}
            <Button asChild size="sm">
              <Link href={`/connections/${c.id}`}>
                Manage connection
                <ArrowUpRight size={13} />
              </Link>
            </Button>
          </article>
        ))}
      </div>
      <div className="connection-foot">
        <ShieldCheck size={18} />
        <p>
          Disconnecting pauses access. Your saved configuration stays intact,
          including after a plan downgrade.
        </p>
      </div>
      <Dialog
        open={slot !== undefined}
        onOpenChange={() => setSlot(undefined)}
        title="Connect a business app"
        description={
          data.runtime
            ? "Custom MCP · Connect directly to your MCP server."
            : "Custom MCP · All connection requests are simulated."
        }
      >
        <div className="tabs" role="tablist" aria-label="Connection source">
          {["G-Bot Recommended", "Custom MCP"].map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={source === name}
              onClick={() => setSource(name)}
            >
              {name}
            </button>
          ))}
        </div>
        {source === "G-Bot Recommended" ? (
          data.runtime?.production ? (
            <CatalogBrowser />
          ) : (
            <Notice>
              No Recommended integrations have completed live acceptance in Demo
              Mode. Use Custom MCP to explore a simulated connection.
            </Notice>
          )
        ) : (
          slot !== undefined && (
            <ConnectionForm slot={slot} onDone={() => setSlot(undefined)} />
          )
        )}
      </Dialog>
    </div>
  );
}
export function ConnectionDetail({ id }: { id: string }) {
  const { data } = useSnapshot(),
    action = useAction();
  const [tab, setTab] = useState("Overview"),
    [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false),
    [consent, setConsent] = useState(false);
  if (!data) return <Loading />;
  const c = data.connections.find((c) => c.id === id);
  if (!c)
    return (
      <Empty
        title="Connection not found"
        description="This connection may have been removed."
        href="/connections"
        action="Back to connected apps"
      />
    );
  const available = canActivate(data.entitlement, data.connections, c.id);
  return (
    <div className="page">
      <Link className="row text-link tiny" href="/connections">
        <ArrowLeft size={15} />
        Connected apps
      </Link>
      <PageHeading
        eyebrow="CONNECTION DETAILS"
        title={c.name}
        description={`${c.category} · ${c.tools.length} discovered tools`}
      >
        <div className="row">
          <AppIcon category={c.category} />
          <StatusBadge status={available ? c.status : "Locked by plan"} />
        </div>
      </PageHeading>
      <div className="tabs" role="tablist" aria-label="Connection sections">
        {[
          "Overview",
          "Authentication",
          "Tools",
          "Permissions",
          "Activity",
          "Advanced",
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="panel detail-panel">
        {tab === "Overview" ? (
          <div className="stack">
            <h2>Connection health</h2>
            <p>
              {c.status === "connected"
                ? "Ready to help with your business tasks."
                : c.error ||
                  "Reconnect this app to restore access to its tools."}
            </p>
            <div className="detail-stat-grid">
              <div>
                <span className="eyebrow">Last connected</span>
                <p>
                  {c.lastConnected
                    ? new Date(c.lastConnected).toLocaleString()
                    : "Not yet connected"}
                </p>
              </div>
              <div>
                <span className="eyebrow">Access</span>
                <p>{c.permissionSummary}</p>
              </div>
            </div>
            {!available && (
              <ErrorState message="Your saved configuration is retained. Disconnect another active connection or compare plans to reconnect." />
            )}
            <div className="row wrap">
              <Button onClick={() => setEdit(true)}>Edit connection</Button>
              {c.status === "connected" ? (
                <Button
                  disabled={action.isPending}
                  onClick={() =>
                    void action.mutateAsync(() =>
                      services.connections.disconnect(id),
                    )
                  }
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  disabled={!available || action.isPending}
                  onClick={() => setConsent(true)}
                >
                  <ArrowClockwise size={16} />
                  Reconnect
                </Button>
              )}
              <Button variant="destructive" onClick={() => setRemove(true)}>
                <Trash size={16} />
                Remove
              </Button>
            </div>
          </div>
        ) : tab === "Authentication" ? (
          <div className="stack">
            <h2>{c.auth} authentication</h2>
            <p>{c.maskedCredential}</p>
            <Notice>
              {data.runtime
                ? "Credentials are protected by your operating system. Reconnect to renew authorization."
                : "Demo authorization is simulated. No real OAuth token is stored."}
            </Notice>
            <Button disabled={!available} onClick={() => setConsent(true)}>
              Review permissions & reconnect
            </Button>
          </div>
        ) : tab === "Tools" || tab === "Permissions" ? (
          <div className="stack">
            <h2>
              {tab === "Tools"
                ? "Discovered tools"
                : "What this connection can do"}
            </h2>
            <p>
              Changes apply immediately. Write actions always require approval.
            </p>
            {!!c.tools.length && (
              <div className="row wrap permission-bulk">
                <span
                  role="status"
                  aria-label={
                    c.tools.every((t) => t.enabled)
                      ? "All tools selected"
                      : c.tools.some((t) => t.enabled)
                        ? "Partial tool selection"
                        : "No tools selected"
                  }
                >
                  {c.tools.filter((t) => t.enabled).length} of {c.tools.length}{" "}
                  enabled
                </span>
                <Button
                  disabled={action.isPending}
                  onClick={() =>
                    void action
                      .mutateAsync(() => services.tools.selectAll(c.id, true))
                      .catch(() => {})
                  }
                >
                  Select All
                </Button>
                <Button
                  disabled={action.isPending}
                  onClick={() =>
                    void action
                      .mutateAsync(() => services.tools.selectAll(c.id, false))
                      .catch(() => {})
                  }
                >
                  Deselect All
                </Button>
              </div>
            )}
            {!c.tools.length ? (
              <Empty
                title="No tools discovered"
                description={
                  data.runtime
                    ? "Check the remote endpoint and reconnect to refresh discovery."
                    : "Check the endpoint or turn off the no-tools simulation, then reconnect."
                }
              />
            ) : (
              c.tools.map((t) => (
                <div className="tool-permission" key={t.id}>
                  <div className="grow">
                    <h3 title={t.label}>{t.label}</h3>
                    <p>{t.description}</p>
                    <div className="row">
                      <Badge tone={t.requiresApproval ? "warning" : "neutral"}>
                        {t.requiresApproval ? "Approval required" : "Read only"}
                      </Badge>
                      <code className="tiny muted" title={t.name}>
                        {t.name}
                      </code>
                    </div>
                  </div>
                  <label className="check-row">
                    <AsyncCheckbox
                      aria-label={`Enable ${t.label}`}
                      checked={t.enabled}
                      disabled={action.isPending}
                      onCheckedChange={(enabled) =>
                        action.mutateAsync(() =>
                          services.tools.toggle(c.id, t.id, enabled),
                        )
                      }
                    />
                    Enabled
                  </label>
                </div>
              ))
            )}
          </div>
        ) : tab === "Activity" ? (
          <div className="stack">
            <h2>Recent activity</h2>
            {data.activity.filter((a) => a.connectionId === id).length ? (
              data.activity
                .filter((a) => a.connectionId === id)
                .slice(0, 30)
                .map((a) => (
                  <div className="settings-row" key={a.id}>
                    <div>
                      <h3>{a.action}</h3>
                      <p>{new Date(a.timestamp).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={a.outcome} />
                  </div>
                ))
            ) : (
              <Empty
                title="No activity yet"
                description="Ask G-Bot a question using this app to see its activity here."
                href="/workspace"
                action="Open workspace"
              />
            )}
          </div>
        ) : (
          <div className="stack">
            <h2>Technical connection details</h2>
            <label className="field">
              MCP URL
              <input readOnly value={c.url} />
            </label>
            <pre className="code">
              {JSON.stringify(
                {
                  connectionId: c.id,
                  category: c.category,
                  transport: data.runtime
                    ? "Streamable HTTP"
                    : "Streamable HTTP (simulated)",
                  tools: c.tools.map((t) => ({
                    name: t.name,
                    risk: t.risk,
                    requiresApproval: t.requiresApproval,
                  })),
                },
                null,
                2,
              )}
            </pre>
          </div>
        )}
      </div>
      {action.error && <ErrorState message={action.error.message} />}
      <Dialog
        open={edit}
        onOpenChange={setEdit}
        title="Edit connection"
        description="Saving will ask you to authorize the updated connection."
      >
        {edit && (
          <ConnectionForm
            slot={c.slot}
            connection={c}
            onDone={() => setEdit(false)}
          />
        )}
      </Dialog>
      <Dialog
        open={consent}
        onOpenChange={setConsent}
        title="Authorize connection"
        description={c.permissionSummary}
      >
        <div className="stack">
          <Notice>
            Read access and tool discovery will be enabled. Write tools still
            require explicit approval per action.
          </Notice>
          {action.error && <ErrorState message={action.error.message} />}
          <Button
            variant="default"
            disabled={action.isPending}
            onClick={() =>
              void action
                .mutateAsync(() => services.connections.connect(id, true))
                .then(() => setConsent(false))
                .catch(() => {})
            }
          >
            {action.isPending
              ? "Authenticating & discovering…"
              : data.runtime
                ? "Reconnect"
                : "Authorize demo connection"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={remove}
        onOpenChange={setRemove}
        title="Remove connection and credential?"
        description="This removes the saved configuration. Conversation history is retained."
      >
        <div className="form-actions">
          <Button onClick={() => setRemove(false)}>Keep connection</Button>
          <Button
            variant="destructive"
            onClick={() =>
              void action
                .mutateAsync(() => services.connections.remove(id))
                .then(() => setRemove(false))
            }
          >
            Remove connection
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
