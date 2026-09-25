"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChatCircleDots,
  Plugs,
  ClockCounterClockwise,
  SlidersHorizontal,
  UserCircle,
  Plus,
  ArrowUpRight,
  SquaresFour,
} from "@phosphor-icons/react";
import { useSnapshot } from "@/hooks/use-services";
import { useWorkspace } from "@/stores/workspace";
import { Logo, Badge, Loading, MockNote } from "@/components/common/ui";
import { Button } from "@/components/ui/button";
import { connectionAvailable } from "@/lib/entitlements";
const navigation = [
  { path: "/workspace", label: "Workspace", icon: ChatCircleDots },
  { path: "/connections", label: "Connected Apps", icon: Plugs },
  { path: "/activity", label: "Activity", icon: ClockCounterClockwise },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    router = useRouter(),
    { data } = useSnapshot();
  const setConversation = useWorkspace((s) => s.setConversation);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (data && !data.user) router.replace("/");
  }, [data, router]);
  if (!ready || !data?.user) return <Loading />;
  const active = data.connections.filter((c) =>
    connectionAvailable(data.entitlement, c),
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="nav-rail">
        <Link href="/workspace" aria-label="G-Bot workspace">
          <Logo small />
        </Link>
        <div className="rail-items">
          {navigation.map((n) => (
            <Link
              key={n.path}
              href={n.path}
              className={`rail-button ${path.startsWith(n.path) ? "selected" : ""}`}
              title={n.label}
              aria-label={n.label}
              aria-current={path.startsWith(n.path) ? "page" : undefined}
            >
              <n.icon
                size={22}
                weight={path.startsWith(n.path) ? "fill" : "regular"}
              />
            </Link>
          ))}
        </div>
        <div className="rail-bottom">
          <Link
            className={`rail-button ${path === "/settings" ? "selected" : ""}`}
            href="/settings"
            aria-label="Settings"
            title="Settings"
          >
            <SlidersHorizontal size={23} />
          </Link>
          <Link
            href="/account"
            className="avatar"
            aria-label="Account"
            title="Account"
          >
            {data.user.name
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </Link>
        </div>
      </aside>
      <div className="shell-main">
        {!data.runtime && (
          <div className="demo-gateway row wrap between">
            <span>Explore freely. Your real workspace stays separate.</span>
            <div className="row wrap">
              <a href="/signup?returnToApp=1">Create your workspace</a>
              <a href="/login?returnToApp=1">Sign in</a>
              <a href="/?returnToApp=1">Exit Demo</a>
            </div>
          </div>
        )}
        <header className="topbar">
          <div className="row">
            <span className="wordmark">
              G-Bot<span className="wordmark-dot">.</span>
            </span>
            <span className="top-divider" />
            <span className="workspace-name">My workspace</span>
            <Badge>{data.entitlement.plan}</Badge>
          </div>
          <div className="row">
            <span className="health-summary">
              <span className="health-dot" />
              {active.length} apps connected
            </span>
            <Link href="/settings" className="top-demo">
              {data.runtime
                ? "Desktop · Local"
                : "Demo Mode · Fictional data · No live actions"}
            </Link>
            <Button
              size="sm"
              onClick={() => {
                setConversation("");
                router.push("/workspace");
              }}
            >
              <Plus size={15} />
              New chat
            </Button>
          </div>
        </header>
        {data.runtime && (
          <div className="offline-banner" role="status">
            {data.runtime.notice}
          </div>
        )}
        {data.diagnostics.offline && (
          <div className="offline-banner">
            Offline simulation · Your history remains available.{" "}
            <Link href="/settings">
              Reconnect in Settings <ArrowUpRight size={12} />
            </Link>
          </div>
        )}
        {data.entitlement.status === "expired" && (
          <div className="offline-banner">
            Your demo entitlement has expired. Connections are paused.{" "}
            <Link href="/account">Restore access</Link>
          </div>
        )}
        <main
          id="main"
          className={
            path === "/workspace" ? "workspace-main" : "management-main"
          }
        >
          {children}
        </main>
        <footer className="shell-footer">
          <MockNote />
          <span>
            <SquaresFour size={12} /> A little less switching. A lot more doing.
          </span>
          <Link href="/settings">G-Bot {data.runtime?.version ?? "Demo"}</Link>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[
          ...navigation,
          { path: "/settings", label: "Settings", icon: SlidersHorizontal },
          { path: "/account", label: "Account", icon: UserCircle },
        ].map((n) => (
          <Link
            key={n.path}
            href={n.path}
            className={path.startsWith(n.path) ? "selected" : ""}
            aria-label={n.label}
          >
            <n.icon size={21} />
            <span>{n.label === "Connected Apps" ? "Apps" : n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
