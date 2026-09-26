"use client";
import Link from "next/link";
import { auditAvailable } from "@/lib/entitlements";
import { exportAudit } from "@/lib/audit";
import { desktopCall } from "@/services/desktop/client";
import { useAction } from "@/hooks/use-services";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ShieldCheck } from "@phosphor-icons/react";
import { useSnapshot } from "@/hooks/use-services";
import { useWorkspace } from "@/stores/workspace";
import {
  PageHeading,
  Loading,
  Empty,
  StatusBadge,
  AppIcon,
  Badge,
} from "@/components/common/ui";
import { Button } from "@/components/ui/button";
export function ActivityScreen() {
  const { data } = useSnapshot(),
    router = useRouter(),
    select = useWorkspace((s) => s.setConversation);
  const operation = useAction();
  const [query, setQuery] = useState(""),
    [approvalStatus, setApprovalStatus] = useState(""),
    [notice, setNotice] = useState("");
  const [app, setApp] = useState(""),
    [status, setStatus] = useState(""),
    [action, setAction] = useState(""),
    [date, setDate] = useState(""),
    [conversation, setConversation] = useState("");
  if (!data) return <Loading label="Loading activity…" />;
  const advanced = auditAvailable(data.entitlement);
  const filtered = data.activity.filter(
    (a) =>
      (!advanced ||
        !query ||
        [a.action, a.detail, a.tool, a.provider, a.model]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!app || a.connectionId === app) &&
      (!status || a.outcome === status) &&
      (!action ||
        (action === "approval" ? a.approvalRequired : !a.approvalRequired)) &&
      (!date || a.timestamp.slice(0, 10) === date) &&
      (!conversation || a.conversationId === conversation),
  );
  return (
    <div className="page">
      <PageHeading
        eyebrow="A CLEAR PICTURE"
        title="Activity"
        description="See what G-Bot did, where it worked, and what needed your approval."
      >
        <Badge>{filtered.length} events</Badge>
      </PageHeading>
      <section className="panel stack">
        <h2>Advanced Activity & Audit</h2>
        {advanced ? (
          <>
            <label className="field">
              Search execution history
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Action, tool, provider, model or error"
              />
            </label>
            <div className="row wrap">
              <Button
                disabled={operation.isPending}
                onClick={() =>
                  void operation
                    .mutateAsync(async () => {
                      if (data.runtime) {
                        const r = await desktopCall(
                          "desktop.data",
                          "audit",
                          "",
                        );
                        setNotice(r.message ?? "");
                      } else {
                        const url = URL.createObjectURL(
                          new Blob([exportAudit(data)], {
                            type: "application/json",
                          }),
                        );
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "g-bot-demo-audit.json";
                        a.click();
                        URL.revokeObjectURL(url);
                      }
                    })
                    .catch(() => {})
                }
              >
                Export local audit
              </Button>
              {data.runtime && (
                <label className="field">
                  Keep Activity
                  <select
                    value={data.preferences.activityRetention ?? 0}
                    onChange={(e) =>
                      void operation
                        .mutateAsync(async () => {
                          const r = await desktopCall(
                            "desktop.data",
                            "audit-retention",
                            e.target.value,
                          );
                          setNotice(r.message ?? "");
                        })
                        .catch(() => {})
                    }
                  >
                    <option value={0}>Until I delete it</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                  </select>
                </label>
              )}
            </div>
            <p className="tiny">
              Local export includes execution metadata and approval decisions,
              excluding approval arguments and private reasoning. Retention
              removes only Activity events after confirmation.
            </p>
            <details>
              <summary>Approval history & consequential actions</summary>
              <label className="field">
                Approval status
                <select
                  value={approvalStatus}
                  onChange={(e) => setApprovalStatus(e.target.value)}
                >
                  <option value="">All decisions</option>
                  {["pending", "approved", "rejected", "cancelled"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              {data.approvals
                .filter((a) => !approvalStatus || a.status === approvalStatus)
                .map((a) => (
                  <div className="settings-row" key={a.id}>
                    <div>
                      <h3>{a.action}</h3>
                      <p>
                        {new Date(a.createdAt).toLocaleString()} ·{" "}
                        {a.executionState ?? "No execution metadata recorded"}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
              {!data.approvals.length && (
                <p>No approval decisions recorded yet.</p>
              )}
            </details>
          </>
        ) : (
          <p>
            Business adds execution search, approval history, local audit export
            and independent Activity retention.{" "}
            <Link className="text-link" href="/account">
              Compare plans
            </Link>
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {operation.error && <p role="alert">{operation.error.message}</p>}
      </section>
      <div className="activity-filters">
        <label className="field">
          Application
          <select aria-label="Application" value={app} onChange={(e) => setApp(e.target.value)}>
            <option value="">All applications</option>
            {data.connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["completed", "failed", "cancelled"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Action type
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            <option value="read">Read context</option>
            <option value="approval">Approval required</option>
          </select>
        </label>
        <label className="field">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field">
          Conversation
          <select
            value={conversation}
            onChange={(e) => setConversation(e.target.value)}
          >
            <option value="">All conversations</option>
            {data.conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!data.preferences.activityVisible ? (
        <Empty
          title="Activity is hidden"
          description="Enable activity visibility in Security & Privacy settings."
          href="/settings"
          action="Open settings"
        />
      ) : !filtered.length ? (
        <Empty
          title={
            data.activity.length
              ? "No events match these filters"
              : "Your work will leave a clear trail"
          }
          description={
            data.activity.length
              ? "Change a filter to see more activity."
              : "Ask G-Bot to check stock or prepare a support ticket. The actions will appear here."
          }
          href="/workspace"
          action="Open workspace"
        />
      ) : (
        <div className="activity-list">
          {filtered.map((a) => {
            const c = data.connections.find((c) => c.id === a.connectionId);
            return (
              <details className="activity-event" key={a.id}>
                <summary>
                  <AppIcon category={c?.category || "Email"} />
                  <div className="grow">
                    <h3>{a.action}</h3>
                    <p>
                      {c?.name || "Unavailable connection"} ·{" "}
                      {new Date(a.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {a.approvalRequired && (
                    <span
                      className="approval-indicator"
                      title="Approval required"
                    >
                      <ShieldCheck size={17} />
                    </span>
                  )}
                  <StatusBadge status={a.outcome} />
                </summary>
                <div className="activity-detail">
                  <p>{a.detail}</p>
                  {a.provider && (
                    <p>
                      Provider: {a.provider} · Model:{" "}
                      {a.model || "Not recorded"}
                    </p>
                  )}
                  {a.durationMs !== undefined && (
                    <p>Duration: {(a.durationMs / 1000).toFixed(1)} s</p>
                  )}
                  {a.retryCount !== undefined && <p>Retries: {a.retryCount}</p>}
                  <div className="row between">
                    <code className="tiny muted">
                      Tool: {a.tool || "Connection lookup"} · Actor: {a.actor}
                    </code>
                    {data.conversations.some(
                      (c) => c.id === a.conversationId,
                    ) ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          select(a.conversationId);
                          router.push("/workspace");
                        }}
                      >
                        View conversation
                        <ArrowUpRight size={14} />
                      </Button>
                    ) : (
                      <Badge>Conversation deleted</Badge>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
