"use client";
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
    [selected, setSelected] = useState("");
  const q = useQuery({
    queryKey: [
      "business-snapshot",
      connection.id,
      refresh,
      connection.status,
      connection.tools
        .map((t) => `${t.id}:${t.enabled}:${t.schemaHash}`)
        .join("|"),
    ],
    queryFn: () => services.connections.snapshot(connection.id, true),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const ask = (text: string) => {
    const state = useWorkspace.getState();
    state.setDraft(state.conversationId, `Using ${connection.name}, ${text}`);
  };
  if (q.isPending)
    return <Loading label={`Loading ${connection.name} context…`} />;
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
          <div className="snapshot-list">
            {items.map((i) => (
              <button
                className="snapshot-item"
                key={i.id}
                aria-pressed={item?.id === i.id}
                onClick={() => setSelected(i.id)}
              >
                <strong title={i.title}>{i.title}</strong>
                <p>{i.subtitle}</p>
                {i.fields.Stock !== undefined ? (
                  <Badge>{i.fields.Stock} in stock</Badge>
                ) : (
                  i.status && <Badge>{i.status}</Badge>
                )}
              </button>
            ))}
          </div>
        </>
      )}
      {item && (
        <section
          className="snapshot-detail"
          aria-label="Selected business record"
        >
          <h3>{item.title}</h3>
          <p className="record-body">{item.preview}</p>
          <dl>
            {Object.entries(item.fields).map(([k, v]) => (
              <div key={k}>
                <dt className="muted">{k}</dt>
                <dd title={v}>{v}</dd>
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
        <Link className="text-link tiny" href={`/connections/${connection.id}`}>
          MCP Details / Tools & Permissions
        </Link>
      </div>
    </>
  );
}
