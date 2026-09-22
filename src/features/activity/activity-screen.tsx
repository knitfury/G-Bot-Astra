"use client";
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
  const [app, setApp] = useState(""),
    [status, setStatus] = useState(""),
    [action, setAction] = useState(""),
    [date, setDate] = useState(""),
    [conversation, setConversation] = useState("");
  if (!data) return <Loading label="Loading activity…" />;
  const filtered = data.activity.filter(
    (a) =>
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
      <div className="activity-filters">
        <label className="field">
          Application
          <select value={app} onChange={(e) => setApp(e.target.value)}>
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
