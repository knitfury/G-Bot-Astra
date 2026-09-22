"use client";
import { useState } from "react";
import { AsyncCheckbox } from "@/components/ui/async-checkbox";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ArrowUpRight,
  ShieldCheck,
  ArrowClockwise,
  DownloadSimple,
  Desktop,
  WarningCircle,
} from "@phosphor-icons/react";
import { useAction, useSnapshot } from "@/hooks/use-services";
import { useWorkspace } from "@/stores/workspace";
import { themeColors, appearances } from "@/lib/theme";
import { services } from "@/services";
import type { Diagnostics } from "@/types/domain";
import {
  PageHeading,
  Loading,
  Badge,
  Notice,
  ErrorState,
  Logo,
} from "@/components/common/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
const diagnosticLabels: {
  key: keyof Omit<Diagnostics, "authFailure">;
  title: string;
  description: string;
}[] = [
  {
    key: "offline",
    title: "Offline mode",
    description:
      "Pause simulated network activity while keeping local history readable.",
  },
  {
    key: "inventoryFailure",
    title: "Inventory unavailable",
    description:
      "Email succeeds, then Inventory fails. Turn this off before retrying.",
  },
  {
    key: "toolFailure",
    title: "Tool execution failure",
    description: "Block read/write tools, including approval completion.",
  },
  {
    key: "providerFailure",
    title: "Provider authentication failure",
    description: "Simulate an invalid key or unavailable model.",
  },
  {
    key: "oauthFailure",
    title: "OAuth consent failure",
    description: "Fail the next OAuth connection attempt.",
  },
  {
    key: "noTools",
    title: "No tools discovered",
    description: "Return an empty tool list on the next connection.",
  },
];
function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="settings-row">
      <span>
        <strong>{label}</strong>
        <p>{description}</p>
      </span>
      <AsyncCheckbox
        className="toggle"
        role="switch"
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
      />
    </label>
  );
}
export function SettingsScreen() {
  const { data } = useSnapshot(),
    action = useAction(),
    router = useRouter();
  const color = useWorkspace((s) => s.color),
    appearance = useWorkspace((s) => s.appearance),
    setColor = useWorkspace((s) => s.setColor),
    setAppearance = useWorkspace((s) => s.setAppearance),
    reduced = useWorkspace((s) => s.reducedMotion),
    setMotion = useWorkspace((s) => s.setMotion),
    select = useWorkspace((s) => s.setConversation);
  const [tab, setTab] = useState("Appearance"),
    [confirm, setConfirm] = useState<
      "history" | "credentials" | "reset" | null
    >(null),
    [confirmText, setConfirmText] = useState(""),
    [help, setHelp] = useState<"help" | "licenses" | null>(null);
  if (!data) return <Loading />;
  const run = (fn: () => Promise<unknown>) =>
    void action.mutateAsync(fn).catch(() => {});
  return (
    <div className="page">
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Settings"
        description="A workspace that feels right, and controls that put you in charge."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {[
            "General",
            "Appearance",
            "AI providers",
            "Connected apps",
            "Security & Privacy",
            "Advanced",
            "About",
          ].map((t) => (
            <button
              className={t === tab ? "active" : ""}
              onClick={() => setTab(t)}
              key={t}
            >
              {t}
            </button>
          ))}
        </nav>
        <section className="settings-content">
          {tab === "Appearance" ? (
            <>
              <h2>Your workspace, in your colors.</h2>
              <p>Choose your color, then the light that suits your day.</p>
              <fieldset className="theme-options">
                <legend>Color</legend>
                <div className="color-options">
                  {themeColors.map((option) => (
                    <label className="theme-option" key={option}>
                      <input
                        type="radio"
                        name="theme-color"
                        value={option}
                        checked={color === option}
                        onChange={() => setColor(option)}
                      />
                      <span
                        className="color-swatch"
                        data-color={option}
                        data-appearance={appearance}
                        aria-hidden="true"
                      >
                        <Check size={14} />
                      </span>
                      <span className="capitalize">{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="theme-options">
                <legend>Appearance</legend>
                <div className="appearance-options">
                  {appearances.map((option) => (
                    <label className="theme-option" key={option}>
                      <input
                        type="radio"
                        name="theme-appearance"
                        value={option}
                        checked={appearance === option}
                        onChange={() => setAppearance(option)}
                      />
                      <span className="capitalize">{option}</span>
                      <Check
                        size={16}
                        className="selection-check"
                        aria-hidden="true"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="appearance-preview" aria-label="Theme preview">
                <div className="preview-heading">
                  <strong className="capitalize">
                    {color} · {appearance}
                  </strong>
                  <span className="tiny muted">
                    {color === "neutral"
                      ? appearance === "light"
                        ? "White"
                        : "Dark grey"
                      : "Your color. Your workspace."}
                  </span>
                </div>
                <div className="theme-preview" aria-hidden="true">
                  <div className="mini-rail">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="mini-app">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="mini-chat">
                    <span className="mini-logo" />
                    <span className="mini-line" />
                    <span className="mini-line short" />
                    <div className="mini-input">
                      <span />
                    </div>
                  </div>
                  <div className="mini-app">
                    <span />
                    <span />
                  </div>
                </div>
                <div className="preview-details">
                  <span className="badge success">✓ Connected</span>
                  <span className="badge warning">Approval required</span>
                  <span className="preview-action">Ask G-Bot ↗</span>
                </div>
              </div>
              <Toggle
                label="Reduce motion"
                description="Use simpler transitions. Your device’s motion preference is also respected."
                checked={reduced}
                onChange={setMotion}
              />
            </>
          ) : tab === "General" ? (
            <div className="panel">
              <h2>Everyday preferences</h2>
              <Toggle
                label="Open workspace on startup"
                description="Saved preference for the future desktop app; browser startup is unchanged."
                checked={data.preferences.startup}
                onChange={(v) =>
                  run(() => services.account.preferences({ startup: v }))
                }
              />
              <Toggle
                label="Desktop notifications"
                description="Mock preference. No operating-system notifications are sent in Phase 1."
                checked={data.preferences.notifications}
                onChange={(v) =>
                  run(() => services.account.preferences({ notifications: v }))
                }
              />
              <div className="settings-row">
                <div>
                  <h3>Language</h3>
                  <p>English is available in Phase 1.</p>
                </div>
                <Badge>English</Badge>
              </div>
            </div>
          ) : tab === "AI providers" || tab === "Connected apps" ? (
            <div className="panel stack">
              <h2>{tab}</h2>
              <p>
                {tab === "AI providers"
                  ? "Manage multiple providers, test connections, and choose your models."
                  : "Manage eight connection slots, inspect tools, and review permissions."}
              </p>
              <Button asChild>
                <Link
                  href={tab === "AI providers" ? "/providers" : "/connections"}
                >
                  Manage {tab.toLowerCase()}
                  <ArrowUpRight size={16} />
                </Link>
              </Button>
            </div>
          ) : tab === "Security & Privacy" ? (
            <div className="stack">
              <div className="panel stack">
                <div className="row">
                  <ShieldCheck size={23} />
                  <h2>Clear boundaries. Your control.</h2>
                </div>
                <p>
                  Conversation history and demo configuration are stored in this
                  browser. Keys and authentication tokens are discarded after
                  simulated testing. This is not encrypted native credential
                  storage.
                </p>
                <Notice>
                  Phase 2 provider and tool requests may send selected data to
                  those services. No real provider, OAuth, or MCP calls are made
                  here.
                </Notice>
                <Link className="text-link" href="/connections">
                  Review tool permissions <ArrowUpRight size={14} />
                </Link>
                <Toggle
                  label="Show activity history"
                  description="Hide or show the activity surface. Audit records are retained until you clear local history."
                  checked={data.preferences.activityVisible}
                  onChange={(v) =>
                    run(() =>
                      services.account.preferences({ activityVisible: v }),
                    )
                  }
                />
              </div>
              <div className="panel">
                <h2>Local data controls</h2>
                <div className="settings-row">
                  <div>
                    <h3>Clear conversation history</h3>
                    <p>
                      Remove conversations, approvals, and activity from this
                      browser.
                    </p>
                  </div>
                  <Button onClick={() => setConfirm("history")}>
                    Clear history
                  </Button>
                </div>
                <div className="settings-row">
                  <div>
                    <h3>Remove all credentials</h3>
                    <p>
                      Disconnect providers and apps while retaining their
                      configuration.
                    </p>
                  </div>
                  <Button onClick={() => setConfirm("credentials")}>
                    Remove credentials
                  </Button>
                </div>
                <div className="settings-row">
                  <div>
                    <h3>Reset all demo data</h3>
                    <p>
                      Remove the demo account and return to a fresh workspace.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setConfirmText("");
                      setConfirm("reset");
                    }}
                  >
                    Reset demo
                  </Button>
                </div>
              </div>
            </div>
          ) : tab === "Advanced" ? (
            <div className="stack">
              <div className="panel">
                <h2>Simulation controls</h2>
                <p>
                  Exercise failures deliberately, then turn them off to test
                  recovery.
                </p>
                {diagnosticLabels.map((d) => (
                  <Toggle
                    key={d.key}
                    label={d.title}
                    description={d.description}
                    checked={data.diagnostics[d.key]}
                    onChange={(v) =>
                      run(() => services.diagnostics.set({ [d.key]: v }))
                    }
                  />
                ))}
                <Toggle
                  label="Expired entitlement"
                  description="Pause all connected app access without deleting saved configuration."
                  checked={data.entitlement.status === "expired"}
                  onChange={(v) => run(() => services.entitlements.expire(v))}
                />
                <label className="field" style={{ marginTop: 18 }}>
                  Next sign-in failure
                  <select
                    value={data.diagnostics.authFailure}
                    onChange={(e) =>
                      run(() =>
                        services.diagnostics.set({
                          authFailure: e.target
                            .value as Diagnostics["authFailure"],
                        }),
                      )
                    }
                  >
                    <option value="none">None</option>
                    <option value="credentials">Invalid credentials</option>
                    <option value="network">Server unavailable</option>
                  </select>
                </label>
                <Button
                  className="reset-diagnostics"
                  onClick={() =>
                    run(async () => {
                      await services.diagnostics.set({
                        offline: false,
                        inventoryFailure: false,
                        toolFailure: false,
                        providerFailure: false,
                        oauthFailure: false,
                        noTools: false,
                        authFailure: "none",
                      });
                      await services.entitlements.expire(false);
                    })
                  }
                >
                  Reset simulation controls
                </Button>
              </div>
              <div className="panel stack">
                <h2>Custom integrations</h2>
                <p>
                  Generic REST adapters support request templates, headers,
                  prompt mappings, and response paths. Requests remain
                  simulated.
                </p>
                <Link href="/providers" className="text-link">
                  Configure a custom provider <ArrowUpRight size={15} />
                </Link>
                <Link href="/connections" className="text-link">
                  Inspect MCP details <ArrowUpRight size={15} />
                </Link>
                <details>
                  <summary className="tiny text-link">
                    Sanitized diagnostics
                  </summary>
                  <pre className="code">
                    {JSON.stringify(
                      {
                        version: "0.1.0",
                        runtime: "web-frontend",
                        storage: "browser-local",
                        liveConnections: false,
                        plan: data.entitlement.plan,
                        simulation: data.diagnostics,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </div>
            </div>
          ) : (
            <div className="panel stack">
              <Logo />
              <h2>G-Bot</h2>
              <p>Ask once. Work across your business.</p>
              <div className="row">
                <Badge>Version 0.1.0</Badge>
                <Badge>Phase 1 · frontend</Badge>
              </div>
              <div className="divider" />
              <h3>Desktop update simulation</h3>
              <p>
                {data.updateStatus === "idle"
                  ? "Check for a simulated update."
                  : data.updateStatus === "available"
                    ? "G-Bot 0.1.1 is available in this simulation."
                    : data.updateStatus === "downloading"
                      ? "Downloading simulated update…"
                      : "Restart required in the future desktop runtime. No actual update was installed."}
              </p>
              <div className="row">
                <Button
                  disabled={action.isPending}
                  onClick={() => run(() => services.updates.check())}
                >
                  <ArrowClockwise size={16} />
                  Check for updates
                </Button>
                {data.updateStatus === "available" && (
                  <Button
                    variant="default"
                    onClick={() => run(() => services.updates.download())}
                  >
                    <DownloadSimple size={16} />
                    Download demo update
                  </Button>
                )}
              </div>
              <div className="divider" />
              <div className="row">
                <Button variant="ghost" onClick={() => setHelp("help")}>
                  Help & demo guide
                </Button>
                <Button variant="ghost" onClick={() => setHelp("licenses")}>
                  Open-source notices
                </Button>
              </div>
              <p className="tiny">
                Windows and macOS packaging, native secure storage, and actual
                updates arrive in Phase 2.
              </p>
            </div>
          )}
          {action.error && <ErrorState message={action.error.message} />}
        </section>
      </div>
      <Dialog
        open={!!confirm}
        onOpenChange={() => setConfirm(null)}
        title={
          confirm === "reset"
            ? "Reset all local demo data?"
            : confirm === "history"
              ? "Clear local history?"
              : "Remove all credentials?"
        }
        description={
          confirm === "reset"
            ? "This removes your demo account, providers, apps, history and preferences."
            : "This change only affects the Phase 1 demo in this browser."
        }
      >
        {confirm === "reset" && (
          <label className="field">
            Type RESET to confirm
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}
        <div className="form-actions">
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={
              action.isPending ||
              (confirm === "reset" && confirmText !== "RESET")
            }
            onClick={() =>
              run(async () => {
                if (confirm === "history") {
                  await services.account.clearHistory();
                  select("");
                } else if (confirm === "credentials")
                  await services.secureStorage.clear();
                else {
                  await services.account.reset();
                  useWorkspace.persist.clearStorage();
                  select("");
                  router.push("/");
                }
                setConfirm(null);
              })
            }
          >
            Confirm{" "}
            {confirm === "reset"
              ? "reset"
              : confirm === "history"
                ? "clear history"
                : "credential removal"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={!!help}
        onOpenChange={() => setHelp(null)}
        title={help === "help" ? "Your demo guide" : "Open-source notices"}
      >
        <div className="stack">
          {help === "help" ? (
            <>
              <p>
                Start with the Maya prompt in Workspace. G-Bot reads Email,
                checks Inventory, and prepares a draft. Choose “Send this
                response” to see approval before simulated sending.
              </p>
              <p>
                For the support workflow, ask about Leo at Northwind. G-Bot
                reads Email and CRM, then asks to create a Helpdesk ticket.
              </p>
              <p>
                Use Advanced settings to simulate inventory failure. Return to
                the conversation after turning the failure off and retry:
                successful steps are kept.
              </p>
            </>
          ) : (
            <>
              <p>
                Built with Next.js, React, TypeScript, Tailwind CSS,
                Radix/shadcn primitives, Phosphor Icons, Framer Motion, Zustand,
                TanStack Query, React Hook Form, Zod, and React Markdown.
              </p>
              <p>
                Dependency license files are distributed with their npm
                packages. See THIRD_PARTY_NOTICES.md in the repository for the
                notice index.
              </p>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
