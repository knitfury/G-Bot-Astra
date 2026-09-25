"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { accountClient, control, billingRedirect } from "./client";
import { PLANS, type Plan } from "../model";
import { Button } from "@/components/ui/button";
import { Badge, Notice, ErrorState, Logo } from "@/components/common/ui";
import { Dialog } from "@/components/ui/dialog";
interface Account {
  email: string;
  name: string;
  plan: Plan;
  billing: {
    status: string;
    period_end: string | null;
    grace_started_at: string | null;
  };
  devices: {
    id: string;
    name: string;
    platform: string;
    version: string;
    validated_at: string;
    revoked_at: string | null;
  }[];
}
export function Portal({ admin = false }: { admin?: boolean }) {
  const [signed, setSigned] = useState(false),
    [account, setAccount] = useState<Account | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [factor, setFactor] = useState(""),
    [qr, setQr] = useState(""),
    [code, setCode] = useState(""),
    [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>(
      [],
    ),
    [remove, setRemove] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [annual, setAnnual] = useState(false),
    [target, setTarget] = useState(""),
    [adminData, setAdminData] = useState<{
      devices: Account["devices"];
      billing: unknown;
      audit: unknown;
      events: unknown;
    } | null>(null),
    [adminAccount, setAdminAccount] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed. Retry.");
    } finally {
      setBusy(false);
    }
  };
  const load = async () => {
    const f = await accountClient().auth.mfa.listFactors();
    if (f.error) throw f.error;
    setFactors(f.data.totp);
    const a = await control<Account>("account");
    setAccount(a);
    setName(a.name);
  };
  useEffect(() => {
    let active = true;
    try {
      const c = accountClient();
      void c.auth.getSession().then(({ data }) => {
        if (active) {
          setSigned(!!data.session);
          if (data.session) void run(load);
        }
      });
      const { data } = c.auth.onAuthStateChange((_event, session) => {
        if (active) setSigned(!!session);
      });
      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account unavailable.");
    }
    return () => {
      active = false;
    };
  }, []);
  const auth = async () => {
    const c = accountClient();
    const r = signup
      ? await c.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name },
            emailRedirectTo: location.origin + "/portal",
          },
        })
      : await c.auth.signInWithPassword({ email, password });
    if (r.error)
      throw Error(
        "Authentication failed. Check your details or use password recovery.",
      );
    setPassword("");
    if (!r.data.session) {
      setNotice("Check your email to verify your account, then sign in.");
      return;
    }
    setSigned(true);
    await load();
  };
  const oauth = async (provider: "google" | "azure") => {
    const r = await accountClient().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: location.origin + "/portal",
        ...(provider === "azure" ? { scopes: "email" } : {}),
      },
    });
    if (r.error) throw Error("Browser sign-in could not start.");
  };
  return (
    <main className="public-page">
      <header className="public-nav">
        <Link className="row" href="/g-bot">
          <Logo small />
          <strong>G-Bot</strong>
        </Link>
        <nav className="row wrap">
          <Link href="/g-bot/support">Support</Link>
          <Link href="/g-bot/downloads">Downloads</Link>
          {signed && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await accountClient().auth.signOut();
                  setSigned(false);
                  setAccount(null);
                })
              }
            >
              Sign out
            </Button>
          )}
        </nav>
      </header>
      <section className="public-heading">
        <span className="eyebrow">
          {admin ? "AUTHORIZED OPERATIONS" : "YOUR G-BOT ACCOUNT"}
        </span>
        <h1>
          {admin
            ? "Account operations"
            : signed
              ? "A little room to grow."
              : "Welcome to your workspace."}
        </h1>
        <p>
          {admin
            ? "Account and device metadata only. Administrator access requires verified MFA."
            : "Your subscription, devices and security, together in one place."}
        </p>
      </section>
      {error && <ErrorState message={error} retry={() => void run(load)} />}
      <p role="status">{busy ? "Working…" : notice}</p>
      {!signed ? (
        <section className="panel portal-auth stack">
          <h2>{signup ? "Create an account" : "Sign in"}</h2>
          <div className="row wrap">
            <Button
              disabled={busy}
              onClick={() => void run(() => oauth("google"))}
            >
              Continue with Google
            </Button>
            <Button
              disabled={busy}
              onClick={() => void run(() => oauth("azure"))}
            >
              Continue with Microsoft
            </Button>
          </div>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(auth);
            }}
          >
            {signup && (
              <label className="field">
                Your name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
              </label>
            )}
            <label className="field">
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                minLength={12}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button variant="default" disabled={busy} type="submit">
              {signup ? "Create account" : "Sign in"}
            </Button>
          </form>
          <Button onClick={() => setSignup(!signup)}>
            {signup ? "I already have an account" : "Create a Free account"}
          </Button>
          <Button
            disabled={!email || busy}
            onClick={() =>
              void run(async () => {
                const r = await accountClient().auth.resetPasswordForEmail(
                  email,
                  { redirectTo: location.origin + "/portal?recovery=1" },
                );
                if (r.error) throw Error("Recovery is unavailable. Try again.");
                setNotice(
                  "If eligible, this address will receive a recovery email.",
                );
              })
            }
          >
            Reset password
          </Button>
          <p className="tiny muted">
            G-Bot accounts are separate from Vidinex shop accounts. Free needs
            no payment card.
          </p>
        </section>
      ) : (
        <>
          <section className="portal-grid">
            <div className="panel stack">
              <h2>Profile</h2>
              <p>{account?.email}</p>
              <label className="field">
                Display name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
              </label>
              <Button
                disabled={busy || !name.trim()}
                onClick={() =>
                  void run(async () => {
                    await control("profile", { name });
                    await load();
                    setNotice("Profile saved.");
                  })
                }
              >
                Save profile
              </Button>
            </div>
            <div className="panel stack">
              <h2>Subscription</h2>
              <Badge>
                {account?.plan ?? "Loading"} ·{" "}
                {account?.billing.status ?? "Checking"}
              </Badge>
              <p>
                {account?.billing.period_end
                  ? `Current period ends ${new Date(account.billing.period_end).toLocaleDateString()}`
                  : "Free includes one connection and one device."}
              </p>
              {account?.billing.grace_started_at && (
                <Notice>
                  Payment needs attention. Paid features remain available for
                  seven days from the first failed-payment state.
                </Notice>
              )}
              <div className="row wrap">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const r = await control<{ url: string }>("billing");
                      billingRedirect(r.url);
                    })
                  }
                >
                  Manage billing
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await control("refresh");
                      await load();
                      setNotice(
                        "Subscription checked. Checkout changes unlock after trusted confirmation.",
                      );
                    })
                  }
                >
                  Refresh status
                </Button>
              </div>
              <p className="tiny muted">
                Upgrades are prorated after payment confirmation. Downgrades and
                cancellations take effect at period end. Your saved
                configuration is retained.
              </p>
            </div>
          </section>
          {!admin && (
            <section className="public-section">
              <div className="row between wrap">
                <h2>A plan for your work.</h2>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={annual}
                    onChange={(e) => setAnnual(e.target.checked)}
                  />
                  Annual · 12 months for the price of 10
                </label>
              </div>
              <div className="plan-grid">
                {Object.entries(PLANS).map(([id, p]) => (
                  <article className="panel stack" key={id}>
                    <span className="eyebrow">{p.name}</span>
                    <h3>
                      €{annual ? p.annual : p.monthly}
                      <small> / {annual ? "year" : "month"}</small>
                    </h3>
                    <p>
                      {p.connections} active MCP connection
                      {p.connections > 1 ? "s" : ""} · {p.devices} device
                      {p.devices > 1 ? "s" : ""}
                    </p>
                    <p>
                      Your AI keys. No G-Bot message or token limit. Demo
                      included.
                    </p>
                    {id !== "free" && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const r = await control<{ url: string }>(
                              account?.plan === "free" ? "checkout" : "billing",
                              {
                                price: `${id}_${annual ? "annual" : "monthly"}`,
                              },
                            );
                            billingRedirect(r.url);
                          })
                        }
                      >
                        {account?.plan === "free"
                          ? `Choose ${p.name}`
                          : "Manage plan"}
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          <section className="panel stack">
            <h2>Devices</h2>
            <p>
              Deactivating a device ends its account access on the next online
              validation. Its local data is never erased remotely.
            </p>
            {account?.devices.length ? (
              account.devices.map((d) => (
                <div className="settings-row" key={d.id}>
                  <div>
                    <h3>{d.name}</h3>
                    <p>
                      {d.platform} · {d.version} · Last checked{" "}
                      {new Date(d.validated_at).toLocaleString()}
                    </p>
                  </div>
                  {d.revoked_at ? (
                    <Badge>Deactivated</Badge>
                  ) : (
                    <Button disabled={busy} onClick={() => setRemove(d.id)}>
                      Deactivate
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <p>
                No devices registered. Sign in through the desktop application
                to activate one.
              </p>
            )}
          </section>
          <section className="panel stack">
            <h2>Security & recovery</h2>
            <p>
              Email accounts can add an authenticator. Google and Microsoft
              accounts use their provider’s security. Administrators must verify
              MFA.
            </p>
            <label className="field">
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
              />
            </label>
            <Button
              disabled={busy || password.length < 12}
              onClick={() =>
                void run(async () => {
                  const r = await accountClient().auth.updateUser({ password });
                  if (r.error)
                    throw Error(
                      "Password change requires a recent sign-in. Sign out and sign in again.",
                    );
                  setPassword("");
                  setNotice("Password updated.");
                })
              }
            >
              Change password
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await accountClient().auth.mfa.enroll({
                    factorType: "totp",
                    friendlyName: "G-Bot authenticator",
                  });
                  if (r.error)
                    throw Error("Authenticator setup could not start.");
                  setFactor(r.data.id);
                  setQr(r.data.totp.qr_code);
                })
              }
            >
              Set up authenticator
            </Button>
            {qr && (
              <img
                src={qr}
                width={200}
                height={200}
                alt="Scan this authenticator QR code"
              />
            )}
            <label className="field">
              Authenticator code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
              />
            </label>
            <Button
              disabled={busy || code.length !== 6}
              onClick={() =>
                void run(async () => {
                  const id = factor || factors[0]?.id;
                  if (!id) throw Error("Set up an authenticator first.");
                  const r = await accountClient().auth.mfa.challengeAndVerify({
                    factorId: id,
                    code,
                  });
                  if (r.error)
                    throw Error("Code not accepted. Try the current code.");
                  setQr("");
                  setCode("");
                  await load();
                  setNotice("Authenticator verified.");
                })
              }
            >
              Verify authenticator
            </Button>
            {factors.map((f) => (
              <Button
                key={f.id}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await accountClient().auth.mfa.unenroll({
                      factorId: f.id,
                    });
                    if (r.error)
                      throw Error(
                        "Verify MFA before removing this authenticator.",
                      );
                    await load();
                  })
                }
              >
                Remove {f.friendly_name || "authenticator"}
              </Button>
            ))}
          </section>
          {admin ? (
            <section className="panel stack">
              <h2>Account lookup</h2>
              <label className="field">
                Account ID
                <input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await control<NonNullable<typeof adminData>>(
                      "admin-accounts",
                      { account: target },
                    );
                    setAdminData(result);
                    setAdminAccount(target);
                  })
                }
              >
                Inspect account
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await control("admin-refresh", { account: target });
                    setNotice("Entitlements reconciled against Stripe.");
                  })
                }
              >
                Reconcile entitlements
              </Button>
              {adminData?.devices.map((device) => (
                <div className="settings-row" key={device.id}>
                  <div>
                    <strong>{device.name}</strong>
                    <p>
                      {device.platform} · {device.version}
                    </p>
                  </div>
                  <Button
                    disabled={busy || !!device.revoked_at}
                    onClick={() => setRemove("admin:" + device.id)}
                  >
                    {device.revoked_at ? "Deactivated" : "Deactivate device"}
                  </Button>
                </div>
              ))}
              {adminData !== null && (
                <pre className="code">{JSON.stringify(adminData, null, 2)}</pre>
              )}
              <p className="tiny muted">
                No impersonation or access to conversations, credentials or
                private app data.
              </p>
            </section>
          ) : (
            <section className="panel stack">
              <h2>Delete account</h2>
              <p>
                Deletes your G-Bot cloud account and revokes devices. Any paid
                subscription ends immediately without an automatic refund.
                Required financial records remain with Stripe. Local history is
                retained until you erase it on each device.
              </p>
              <Button
                variant="destructive"
                onClick={() => setRemove("account")}
              >
                Delete my account
              </Button>
            </section>
          )}
        </>
      )}
      <Dialog
        open={!!remove}
        onOpenChange={() => {
          setRemove("");
          setConfirmation("");
        }}
        title={
          remove === "account"
            ? "Permanently delete your account?"
            : "Deactivate this device?"
        }
        description={
          remove === "account"
            ? "Sign in again immediately before confirming. This cannot be undone."
            : "The device will lose operational access on its next online check. Local data stays on the device."
        }
      >
        {remove === "account" && (
          <label className="field">
            Type DELETE MY ACCOUNT
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
        )}
        <div className="form-actions">
          <Button onClick={() => setRemove("")}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={
              busy ||
              (remove === "account" && confirmation !== "DELETE MY ACCOUNT")
            }
            onClick={() =>
              void run(async () => {
                if (remove === "account") {
                  await control("delete-account", { confirm: confirmation });
                  await accountClient().auth.signOut();
                  setSigned(false);
                  setAccount(null);
                } else if (remove.startsWith("admin:")) {
                  await control("admin-revoke", {
                    account: adminAccount,
                    device: remove.slice(6),
                    confirm: true,
                  });
                  setAdminData(
                    await control<NonNullable<typeof adminData>>(
                      "admin-accounts",
                      { account: adminAccount },
                    ),
                  );
                  setNotice(
                    "Device deactivated. The action was recorded in the audit log.",
                  );
                } else {
                  await control("revoke-device", { id: remove, confirm: true });
                  await load();
                }
                setRemove("");
              })
            }
          >
            {remove === "account" ? "Delete account" : "Deactivate device"}
          </Button>
        </div>
      </Dialog>
      <footer className="public-footer">
        <Link href="/g-bot/privacy">Privacy</Link>
        <Link href="/g-bot/terms">Terms</Link>
        <span>Vidinex E-Commerce OÜ · Estonia</span>
      </footer>
    </main>
  );
}
