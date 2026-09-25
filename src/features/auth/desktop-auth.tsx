"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { services } from "@/services";
import { desktopCall } from "@/services/desktop/client";
import { Button } from "@/components/ui/button";
import { Logo, Notice, ErrorState } from "@/components/common/ui";
export function DesktopAuth({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const router = useRouter(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const run = async (fn: () => Promise<unknown>, enter = false) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (enter) router.replace(signup ? "/onboarding" : "/workspace");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/ \([A-Z_]+\)$/, "")
          : "Unable to sign in. Retry.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-layout">
      <div className="auth-brand">
        <Logo />
        <strong>G-Bot</strong>
      </div>
      <section className="auth-copy">
        <span className="eyebrow">YOUR BUSINESS. WORKING TOGETHER.</span>
        <h1>
          Your business.
          <br />
          Your workspace.
        </h1>
        <p>Bring your AI. Connect your apps. Keep control of your data.</p>
        <Notice>
          AI requests go directly to your provider. Business tools connect
          directly to your authorized apps. G-Bot account services handle
          identity, subscription and device access.
        </Notice>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form panel stack">
          <Link className="text-link" href="/">
            ← Back to Welcome
          </Link>
          <h2>{signup ? "Create your G-Bot account" : "Welcome back"}</h2>
          <div className="row wrap">
            {(["google", "azure"] as const).map((provider) => (
              <Button
                key={provider}
                disabled={busy}
                onClick={() =>
                  void run(() => desktopCall("desktop.signIn", provider), true)
                }
              >
                {provider === "google" ? "Google" : "Microsoft"}
              </Button>
            ))}
          </div>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  signup
                    ? services.auth.signup(name, email, password)
                    : services.auth.login(email, password),
                true,
              );
            }}
          >
            {signup && (
              <label className="field">
                Your name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
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
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button type="submit" variant="default" disabled={busy}>
              {busy ? "Connecting…" : signup ? "Create account" : "Sign in"}
            </Button>
          </form>
          <div className="row wrap">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => router.push(signup ? "/login" : "/signup")}
            >
              {signup ? "Already have an account?" : "Create an account"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || !email}
              onClick={() =>
                void run(async () => {
                  await services.auth.resetPassword(email);
                  setMessage(
                    "If this email is eligible, a recovery link will arrive shortly.",
                  );
                })
              }
            >
              Forgot password?
            </Button>
          </div>
          <details>
            <summary>Use an authenticator code</summary>
            <div className="stack">
              <label className="field">
                Six-digit code
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
                  void run(() => desktopCall("desktop.verifyMfa", code), true)
                }
              >
                Verify code
              </Button>
            </div>
          </details>
          {error && <ErrorState message={error} />}
          <p role="status">{message}</p>
          <div className="divider" />
          <Button
            disabled={busy}
            onClick={() => void run(() => desktopCall("desktop.openDemo"))}
          >
            Explore Demo
          </Button>
          <p className="tiny muted">
            No AI keys or live app connections needed. Demo data is separate
            from your real workspace.
          </p>
        </div>
      </section>
    </div>
  );
}
