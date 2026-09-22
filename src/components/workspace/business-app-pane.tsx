"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  ArrowClockwise,
  MagnifyingGlass,
  ArrowUpRight,
  CaretDown,
  DotsThree,
  EnvelopeSimple,
} from "@phosphor-icons/react";
import Link from "next/link";
import { services } from "@/services";
import { useSnapshot } from "@/hooks/use-services";
import { useWorkspace } from "@/stores/workspace";
import { connectionAvailable } from "@/lib/entitlements";
import {
  AppIcon,
  Badge,
  Empty,
  Loading,
  ErrorState,
} from "@/components/common/ui";
import { Button } from "@/components/ui/button";
import type { BusinessRecord, MCPConnection } from "@/types/domain";
function Records({ connection }: { connection: MCPConnection }) {
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState("");
  const q = useQuery({
    queryKey: ["records", connection.id, connection.category],
    queryFn: () => services.connections.records(connection.category),
  });
  if (q.isPending) return <Loading label="Loading app context…" />;
  if (q.error)
    return (
      <ErrorState message={q.error.message} retry={() => void q.refetch()} />
    );
  const filtered = q.data.filter((r) =>
    (r.customer + " " + r.company + " " + r.title + " " + r.subtitle)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const record = filtered.find((r) => r.id === selected) || filtered[0];
  return (
    <>
      <div className="pane-search">
        <MagnifyingGlass size={15} />
        <input
          aria-label={`Search ${connection.category}`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            connection.category === "Inventory"
              ? "Search products…"
              : "Search customers…"
          }
        />
      </div>
      <div className="row between pane-section-label">
        <span className="eyebrow">
          {connection.category === "Email"
            ? "INBOX"
            : connection.category === "Inventory"
              ? "PRODUCTS"
              : "RECENT CONTEXT"}
        </span>
        <Badge>{filtered.length}</Badge>
      </div>
      <div className="record-list">
        {filtered.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r.id)}
            className={`record-item ${record?.id === r.id ? "active" : ""}`}
          >
            {connection.category === "Inventory" ? (
              <div className="product-thumb">
                <span
                  className={`product-drawing product-${r.metadata.SKU.split("-")[0].toLowerCase()}`}
                />
              </div>
            ) : (
              <span className="avatar">
                {r.customer
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </span>
            )}
            <div className="grow">
              <div className="row between">
                <strong>
                  {connection.category === "Email" ? r.customer : r.title}
                </strong>
                {connection.category === "Email" && (
                  <span className="unread-dot" />
                )}
              </div>
              <p>{connection.category === "Email" ? r.title : r.subtitle}</p>
              <span>
                {connection.category === "Inventory"
                  ? `${r.metadata.stock} in stock`
                  : r.company}
              </span>
            </div>
          </button>
        ))}
      </div>
      {record ? (
        <RecordDetail record={record} />
      ) : (
        <Empty
          title="No matching context"
          description="Try a customer name, product, or SKU."
        />
      )}
    </>
  );
}
function RecordDetail({ record: r }: { record: BusinessRecord }) {
  return (
    <div className="record-detail">
      <div className="row between">
        <span className="eyebrow">
          {r.category === "Email"
            ? "SELECTED EMAIL"
            : r.category === "Inventory"
              ? "STOCK OVERVIEW"
              : "DETAILS"}
        </span>
        <Badge tone={r.status === "Low stock" ? "warning" : "success"}>
          {r.status}
        </Badge>
      </div>
      {r.category === "Inventory" ? (
        <>
          <div className="large-product">
            <span
              className={`product-drawing product-${r.metadata.SKU.split("-")[0].toLowerCase()}`}
            />
          </div>
          <h3>{r.title}</h3>
          <p className="tiny">{r.metadata.SKU} · Sand finish</p>
          <div className="stock-number">
            {r.metadata.stock}
            <span>units available</span>
          </div>
          <div className="detail-pairs">
            <span>Warehouse</span>
            <strong>{r.metadata.location}</strong>
            <span>Requested</span>
            <strong>{r.metadata.quantity} units</strong>
            <span>Order reference</span>
            <strong>{r.metadata.order}</strong>
          </div>
        </>
      ) : (
        <>
          <h3>{r.title}</h3>
          <div className="sender row">
            <span className="avatar">
              {r.customer
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </span>
            <div>
              <strong>{r.customer}</strong>
              <p>{r.metadata.email}</p>
            </div>
          </div>
          <p className="record-body">{r.body}</p>
          <div className="detail-pairs">
            <span>Customer</span>
            <strong>{r.company}</strong>
            <span>Order</span>
            <strong>{r.metadata.order}</strong>
          </div>
        </>
      )}
      <div className="context-note">
        <span className="health-dot" />
        Available as context for G-Bot
      </div>
    </div>
  );
}
export function BusinessAppPane({
  side,
  onClose,
  mobile = false,
}: {
  side: "left" | "right";
  onClose?: () => void;
  mobile?: boolean;
}) {
  const { data } = useSnapshot(),
    pane = useWorkspace((s) => s[side]),
    setPane = useWorkspace((s) => s.setPane);
  const [menu, setMenu] = useState(false),
    [refresh, setRefresh] = useState(0);
  if (!data) return null;
  const connections = data.connections.filter((c) =>
    connectionAvailable(data.entitlement, c),
  );
  const selected = data.connections.find(
    (c) => c.id === pane.selectedConnectionId,
  );
  const connection =
    selected ||
    connections[side === "left" ? 0 : Math.min(1, connections.length - 1)];
  const available =
    connection && connectionAvailable(data.entitlement, connection);
  return (
    <aside
      className={`business-pane ${side} ${mobile ? "mobile-pane" : ""}`}
      aria-label={`${side} business app pane`}
      style={mobile ? undefined : { width: pane.width }}
    >
      <header className="pane-header">
        <div className="row grow">
          {connection && <AppIcon category={connection.category} size={17} />}
          <select
            aria-label={`${side} pane app`}
            value={connection?.id || ""}
            onChange={(e) =>
              setPane(side, { selectedConnectionId: e.target.value })
            }
          >
            {!connection && <option value="">Choose app</option>}
            {selected && !available && (
              <option value={selected.id}>{selected.name} · unavailable</option>
            )}
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${side} pane options`}
          onClick={() => setMenu(!menu)}
        >
          <DotsThree size={20} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Close ${side} pane`}
          onClick={() => {
            if (onClose) onClose();
            else setPane(side, { enabled: false });
          }}
        >
          <X size={15} />
        </Button>
      </header>
      {menu && (
        <div className="pane-menu stack">
          <label className="field">
            Pane width · {pane.width}px
            <input
              type="range"
              aria-label={`${side} pane width`}
              min={240}
              max={360}
              value={pane.width}
              onChange={(e) => setPane(side, { width: Number(e.target.value) })}
            />
          </label>
          <div className="row">
            <Button size="sm" onClick={() => setRefresh((v) => v + 1)}>
              <ArrowClockwise size={14} />
              Refresh
            </Button>
            {connection && (
              <Button size="sm" asChild>
                <Link href={`/connections/${connection.id}`}>
                  Manage
                  <ArrowUpRight size={13} />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="pane-content">
        {connection && available ? (
          <Records
            key={`${connection.id}-${refresh}`}
            connection={connection}
          />
        ) : (
          <Empty
            title={
              connection ? "Connection unavailable" : "Add business context"
            }
            description={
              connection
                ? "Reconnect this app or check your plan. Your pane selection has been preserved."
                : "Connect an app, then choose it for this pane."
            }
            href="/connections"
            action="Manage apps"
          />
        )}
      </div>
      <footer className="pane-footer">
        <span className={`health-dot ${!available ? "inactive" : ""}`} />
        {available ? "Connected · simulated context" : "Context paused"}
        <span className="grow" />
        <EnvelopeSimple size={12} />
      </footer>
    </aside>
  );
}
