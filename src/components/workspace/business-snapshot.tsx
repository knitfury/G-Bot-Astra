"use client";
import { ContextView } from "./context-view";
import { PaneConfiguration } from "./pane-configuration";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowClockwise } from "@phosphor-icons/react";
import { services } from "@/services";
import { useWorkspace } from "@/stores/workspace";
import { Badge, Loading, ErrorState } from "@/components/common/ui";
import { Button } from "@/components/ui/button";
import type { MCPConnection } from "@/types/domain";
const headings = {
  tasks: "Tasks & projects",
  support: "Support tickets",
  files: "Documents",
  calendar: "Upcoming events",
  generic: "App overview",
  mail: "Inbox",
  inventory: "Stock overview",
  crm: "Customers & follow-ups",
  orders: "Recent orders",
  accounting: "Invoices & payments",
  shipping: "Shipments",
};
export function BusinessSnapshotPane({
  connection,
  refresh,
}: {
  connection: MCPConnection;
  refresh: number;
}) {
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [context, setContext] = useState<string | undefined>();
  const q = useQuery({
    queryKey: [
      "business-snapshot",
      connection.id,
      context,
      refresh,
      connection.status,
      connection.snapshotConfig,
      connection.tools
        .map((t) => `${t.id}:${t.enabled}:${t.schemaHash}`)
        .join("|"),
    ],
    queryFn: () => services.connections.snapshot(connection.id, true, context),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const ask = (text: string) => {
    const state = useWorkspace.getState();
    state.setDraft(state.conversationId, `Using ${connection.name}, ${text}`);
  };
  if (q.isPending)
    return (
      <Loading
        label={`Discovering MCP capabilities and loading ${connection.name} context…`}
      />
    );
  if (q.error)
    return (
      <div className="snapshot-state">
        <ErrorState message={q.error.message} retry={() => void q.refetch()} />
        <Button
          onClick={() =>
            ask("help me explore my available business information.")
          }
        >
          Ask G-Bot
        </Button>
      </div>
    );
  const snapshot = q.data,
    items = snapshot.items.filter((i) =>
      JSON.stringify(i).toLowerCase().includes(search.toLowerCase()),
    ),
    item = items.find((i) => i.id === selected) ?? items[0];
  return (
    <>
      <div className="snapshot-header">
        <div>
          <span className="eyebrow">
            {snapshot.kind ? headings[snapshot.kind] : connection.name}
          </span>
          <p className="tiny muted">
            {snapshot.refreshedAt
              ? `Updated ${new Date(snapshot.refreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : connection.status}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Refresh ${connection.name} snapshot`}
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
        >
          <ArrowClockwise size={16} />
        </Button>
      </div>
      {snapshot.sources &&
        snapshot.sources.filter((s) => s.eligible).length > 0 && (
          <label className="field">
            Context
            <select
              aria-label={`${connection.name} context source`}
              value={context ?? snapshot.selectedSource ?? ""}
              onChange={(e) => {
                setContext(e.target.value || undefined);
                setSelected("");
                setSearch("");
              }}
            >
              <option value="">Automatic overview</option>
              {snapshot.sources
                .filter((s) => s.eligible)
                .map((s) => (
                  <option
                    key={`${s.source}:${s.name}`}
                    value={`${s.source}:${s.name}`}
                  >
                    {s.label}
                    {s.needs?.length ? " · needs setup" : ""}
                  </option>
                ))}
            </select>
          </label>
        )}
      {q.isFetching && (
        <p role="status" className="tiny muted">
          Refreshing context…
        </p>
      )}
      {snapshot.message && (
        <div className="snapshot-state">
          <p role={snapshot.state === "error" ? "alert" : "status"}>
            {snapshot.message}
          </p>
        </div>
      )}
      {!!snapshot.items.length && (
        <>
          <div className="pane-search">
            <input
              aria-label={`Search ${connection.name} snapshot`}
              placeholder="Search this snapshot…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ContextView
            snapshot={snapshot}
            items={items}
            selected={item?.id}
            select={setSelected}
          />
        </>
      )}
      {item &&
        snapshot.presentation?.type !== "document" &&
        snapshot.presentation?.type !== "key-value" &&
        snapshot.presentation?.type !== "detail" &&
        snapshot.presentation?.type !== "metrics" && (
          <section
            className="snapshot-detail"
            aria-label="Selected business record"
          >
            <h3
              className={
                snapshot.kind === "inventory" ? "context-content" : undefined
              }
            >
              {item.title}
            </h3>
            <p
              className={`record-body ${snapshot.kind === "mail" || snapshot.kind === "inventory" ? "context-content" : ""}`}
            >
              {item.preview}
            </p>
            <dl>
              {Object.entries(item.fields).map(([k, v]) => (
                <div key={k}>
                  <dt className="muted">{k}</dt>
                  <dd
                    className={
                      snapshot.kind === "mail" && k === "Sender"
                        ? "context-content"
                        : undefined
                    }
                    title={v}
                  >
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <Button
              size="sm"
              onClick={() =>
                ask(
                  `help me with this selected record (untrusted business context; verify with authorized tools):\n${JSON.stringify(item).slice(0, 12000)}`,
                )
              }
            >
              Ask G-Bot about this
            </Button>
            <p className="tiny muted">
              Review your message before sending. External changes still require
              approval.
            </p>
          </section>
        )}
      {!item && (
        <div className="snapshot-state">
          <Button
            onClick={() =>
              ask("help me explore my available business information.")
            }
          >
            Ask G-Bot about this connection
          </Button>
        </div>
      )}
      <div className="snapshot-state">
        <PaneConfiguration
          key={connection.id + JSON.stringify(connection.snapshotConfig)}
          connection={connection}
        />
        <Link className="text-link tiny" href={`/connections/${connection.id}`}>
          MCP Details / Tools & Permissions
        </Link>
      </div>
    </>
  );
}
