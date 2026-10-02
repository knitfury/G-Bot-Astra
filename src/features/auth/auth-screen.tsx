"use client";
import { useAccountLinks, WebAccountRedirect } from "./account-boundary";
import { DesktopAuth } from "./desktop-auth";
import { useSnapshot } from "@/hooks/use-services";
import { useEffect } from "react";
import { desktopCall } from "@/services/desktop/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ShieldCheck } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useDesktop } from "@/hooks/use-desktop";
import { services } from "@/services";
import { useAction } from "@/hooks/use-services";
import { useWorkspace } from "@/stores/workspace";
import {
  Logo,
  AppIcon,
  Badge,
  ErrorState,
  Notice,
} from "@/components/common/ui";
import { Button } from "@/components/ui/button";
export function AuthScreen({ mode }: { mode: "welcome" | "login" | "signup" }) {
  const router = useRouter(),
    action = useAction(),
    setConversation = useWorkspace((s) => s.setConversation);
  const links = useAccountLinks();
  const desktop = useDesktop();
  const { data: snapshot } = useSnapshot();
  useEffect(() => {
    if (
      mode === "welcome" &&
      snapshot?.runtime?.production &&
      snapshot.user &&
      snapshot.entitlement.status === "active"
    )
      router.replace("/workspace");
  }, [snapshot, router, mode]);
  async function demo() {
    if (desktop && snapshot?.runtime?.production) {
      await action.mutateAsync(() => desktopCall("desktop.openDemo"));
      return;
    }
    await action.mutateAsync(() => services.auth.demo());
    setConversation("");
    router.push("/workspace");
  }
  if (!desktop && mode !== "welcome") return <WebAccountRedirect />;
  if (desktop && !snapshot) return <div role="status">Opening G-Bot…</div>;
  if (desktop && snapshot?.runtime?.production && mode !== "welcome")
    return <DesktopAuth key={mode} mode={mode} />;
  if (desktop && !snapshot?.runtime?.production)
    return (
      <div className="auth-layout">
        <div className="auth-brand">
          <Logo />
          <strong>G-Bot Desktop</strong>
        </div>
        <section className="auth-copy">
          <h1>
            Your business.
            <br />
            Your workspace.
          </h1>
          <p>
            Connect your AI and remote MCP servers. Your credentials stay
            protected on this device.
          </p>
        </section>
        <section className="auth-card panel stack">
          <h2>Open your local workspace</h2>
          <p>
            No cloud sign-in is configured. This profile is local to your
            operating-system account. Plan controls are for development testing.
          </p>
          <Button
            variant="default"
            disabled={action.isPending}
            onClick={() => void demo().catch(() => {})}
          >
            Open local workspace
          </Button>
          <p className="tiny">
            Your prompts and selected context go directly to your chosen AI
            provider. MCP calls go directly to your configured servers.
          </p>
          {snapshot?.runtime?.production && snapshot.runtime.sessionNotice && (
            <Notice>{snapshot.runtime.sessionNotice}</Notice>
          )}
          {action.error && <ErrorState message={action.error.message} />}
        </section>
      </div>
    );
  return (
    <div className="auth-layout">
      <div className="auth-brand">
        <Link href="/" className="row">
          <Logo small />
          <strong>
            G-Bot<span className="wordmark-dot">.</span>
          </strong>
        </Link>
        {snapshot?.runtime?.production ? (
          <span className="tiny muted">Your providers. Your permissions.</span>
        ) : (
          <span className="tiny muted">Product preview · Fictional data</span>
        )}
      </div>
      <section className="auth-copy">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="eyebrow">YOUR BUSINESS. WORKING TOGETHER.</span>
          <h1>
            One conversation.
            <br />A whole business
            <br />
            <span>in motion.</span>
          </h1>
          <p>
            Connect your apps. Bring your AI. Turn the things
            <br className="desktop-only" /> on your mind into things that are
            done.
          </p>
          <div className="auth-visual">
            <div className="row between">
              <div className="row">
                <Logo small />
                <strong>On it, Alex.</strong>
              </div>
              <Badge tone="success">Working across your apps</Badge>
            </div>
            <div className="visual-step">
              <AppIcon category="Email" />
              <div className="grow">
                <strong>Found Maya’s latest email</strong>
                <p>12 Arc Desk Lamps for Dawson Studio</p>
              </div>
              <Check size={16} />
            </div>
            <div className="visual-step">
              <AppIcon category="Inventory" />
              <div className="grow">
                <strong>Checked product availability</strong>
                <p>24 available · Chennai warehouse</p>
              </div>
              <Check size={16} />
            </div>
            <div className="visual-draft">
              <span className="eyebrow">READY FOR YOUR REVIEW</span>
              <p>
                “Hi Maya, good news — we have enough Arc Desk Lamps for your
                studio…”
              </p>
              <span className="text-link">Your approval. Then it’s done.</span>
            </div>
          </div>
          <div className="auth-assurance">
            <ShieldCheck size={18} />
            Your providers, your permissions, your decisions.
          </div>
        </motion.div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form panel">
          <Logo />
          <h2>Meet your new way to work.</h2>
          <p>
            A calmer workspace for everything your business needs to get done.
          </p>
          <Button variant="default" asChild>
            <Link href={links.signup}>
              Create account
              <ArrowRight size={17} />
            </Link>
          </Button>
          <Button asChild>
            <Link href={links.signin}>Sign in</Link>
          </Button>
          <div className="divider" />
          <Button
            variant="ghost"
            disabled={action.isPending}
            onClick={() => void demo().catch(() => {})}
          >
            {action.isPending
              ? "Preparing your workspace…"
              : snapshot?.runtime?.production
                ? "Explore Demo"
                : "Explore the demo"}
            <ArrowRight size={16} />
          </Button>
          <p className="tiny">
            A populated workspace with fictional customers. No account or API
            key needed.
          </p>
          {snapshot?.runtime?.production && snapshot.runtime.sessionNotice && (
            <Notice>{snapshot.runtime.sessionNotice}</Notice>
          )}
          {action.error && <ErrorState message={action.error.message} />}
          <div className="auth-disclosure">
            {snapshot?.runtime?.production
              ? "Your AI and app data flow directly to the providers you choose. You approve consequential actions."
              : "Demo Mode uses fictional local business data. No AI key or live app connection is required, and no live actions are performed."}
          </div>
        </div>
      </section>
    </div>
  );
}
