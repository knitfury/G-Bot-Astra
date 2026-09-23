"use client";
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
  requiredPlan,
  slotAvailable,
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
      category: connection?.category || appCategories[slot],
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
                placeholder="demo-token-1234"
              />
              <span className="field-help">
                {desktop ? "Token / API key" : "Demo token"}s are discarded. Do
                not use a real credential.
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
  if (!data) return <Loading />;
  const active = data.connections.filter((c) =>
    connectionAvailable(data.entitlement, c),
  ).length;
  return (
    <div className={embedded ? "stack" : "page"}>
      {!embedded ? (
        <PageHeading
          eyebrow="WORK BETTER, TOGETHER"
          title="Connected apps"
          description="Bring your business into the conversation. Choose any compatible app for each of your eight connection slots."
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
      <div className="connection-summary">
        <div className="row">
          <Plugs size={20} />
          <span>
            <strong className="capitalize">{data.entitlement.plan}</strong> plan
            · {data.entitlement.maxActiveConnections} active connection
            {data.entitlement.maxActiveConnections === 1 ? "" : "s"}
          </span>
        </div>
        <Link className="text-link tiny" href="/account">
          Compare plans <ArrowUpRight size={12} />
        </Link>
      </div>
      <div className="connection-grid">
        {Array.from({ length: 8 }, (_, i) => {
          const c = data.connections.find((c) => c.slot === i),
            available = slotAvailable(data.entitlement, i);
          return (
            <article
              className={`connection-card ${!available ? "locked" : ""}`}
              key={i}
            >
              <div className="row between">
                <AppIcon category={c?.category || appCategories[i]} />
                <span className="eyebrow">
                  SLOT {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3>{c?.name || `Connect ${appCategories[i].toLowerCase()}`}</h3>
              <p>{c?.category || "Your choice of business app"}</p>
              {!available ? (
                <>
                  <Badge tone="warning">
                    <Lock size={11} />
                    {data.entitlement.status === "expired"
                      ? "Plan expired"
                      : `${requiredPlan(i)} plan`}
                  </Badge>
                  <p className="slot-detail">
                    {c
                      ? "Configuration saved. Access is paused by your plan."
                      : "Available when your workspace needs more."}
                  </p>
                  <div className="row">
                    <Button size="sm" asChild>
                      <Link href="/account">
                        View plans
                        <ArrowUpRight size={13} />
                      </Link>
                    </Button>
                    {c && (
                      <Link
                        className="text-link tiny"
                        href={`/connections/${c.id}`}
                      >
                        Inspect
                      </Link>
                    )}
                  </div>
                </>
              ) : c ? (
                <>
                  <StatusBadge status={c.status} />
                  <p className="slot-detail">
                    {c.tools.length} tools · {c.auth} authentication
                  </p>
                  <Button asChild size="sm">
                    <Link href={`/connections/${c.id}`}>
                      Manage connection
                      <ArrowUpRight size={13} />
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Badge>Available</Badge>
                  <p className="slot-detail">
                    Email, CRM, inventory — make it yours.
                  </p>
                  <Button size="sm" onClick={() => setSlot(i)}>
                    <Plus size={14} />
                    Connect app
                  </Button>
                </>
              )}
            </article>
          );
        })}
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
        description={`Set up connection slot ${(slot ?? 0) + 1}. ${data.runtime ? "Connect directly to your MCP server." : "All connection requests are simulated."}`}
      >
        {slot !== undefined && (
          <ConnectionForm slot={slot} onDone={() => setSlot(undefined)} />
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
  const available = slotAvailable(data.entitlement, c.slot);
  return (
    <div className="page">
      <Link className="row text-link tiny" href="/connections">
        <ArrowLeft size={15} />
        Connected apps
      </Link>
      <PageHeading
        eyebrow="CONNECTION DETAILS"
        title={c.name}
        description={`${c.category} · Slot ${c.slot + 1} · ${c.tools.length} discovered tools`}
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
              <ErrorState message="Your saved configuration is retained, but this slot is unavailable on your plan." />
            )}
            <div className="row wrap">
              <Button disabled={!available} onClick={() => setEdit(true)}>
                Edit connection
              </Button>
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
              No real OAuth token is stored. Phase 2 will use native secure
              credential storage.
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
            {!c.tools.length ? (
              <Empty
                title="No tools discovered"
                description="Check the endpoint or turn off the no-tools simulation, then reconnect."
              />
            ) : (
              c.tools.map((t) => (
                <div className="tool-permission" key={t.id}>
                  <div className="grow">
                    <h3>{t.label}</h3>
                    <p>{t.description}</p>
                    <div className="row">
                      <Badge tone={t.requiresApproval ? "warning" : "neutral"}>
                        {t.requiresApproval ? "Approval required" : "Read only"}
                      </Badge>
                      <code className="tiny muted">{t.name}</code>
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
                  transport: "Streamable HTTP (simulated)",
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
