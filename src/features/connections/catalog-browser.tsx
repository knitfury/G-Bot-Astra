"use client";
import { useState } from "react";
import { desktopCall } from "@/services/desktop/client";
import { Button } from "@/components/ui/button";
import { Badge, ErrorState } from "@/components/common/ui";
import type { Catalog } from "@/production/model";
export function CatalogBrowser() {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [category, setCategory] = useState("All");
  const load = async () => {
    setBusy(true);
    try {
      const r = await desktopCall("desktop.catalog");
      setCatalog(r.catalog);
      setMessage(
        r.message ||
          (!r.catalog?.entries.some((e) => e.status === "recommended")
            ? "No Recommended integrations have completed acceptance yet. Custom connections remain available."
            : ""),
      );
    } catch {
      setMessage("Catalog unavailable. Custom connections remain available.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel stack">
      <div className="row between wrap">
        <div>
          <h2>G-Bot Recommended</h2>
          <p>Reviewed integrations, organized around your business.</p>
        </div>
        <Button disabled={busy} onClick={() => void load()}>
          {busy ? "Loading catalog…" : "Browse Recommended"}
        </Button>
      </div>
      <label className="field">
        Business category
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {[
            "All",
            "CRM",
            "Accounting",
            "Email & Communication",
            "Ecommerce",
            "Inventory",
            "Shipping & Logistics",
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {message && <p role="status">{message}</p>}
      {catalog?.disabledFeatures.includes("recommended") ? (
        <ErrorState message="Recommended connections are temporarily paused for a security review. Connections using other endpoints remain available." />
      ) : (
        catalog?.entries
          .filter(
            (e) =>
              e.status === "recommended" &&
              (category === "All" || e.category === category),
          )
          .map((e) => (
            <article className="panel stack" key={e.id}>
              <h3>{e.name}</h3>
              <Badge>{e.category}</Badge>
              <p>{e.description}</p>
              <p>{e.setup}</p>
              <label className="field">
                Verified endpoint
                <input readOnly value={e.endpoint} />
              </label>
              <p>
                {e.auth} · Streamable HTTP · G-Bot {e.minimumVersion} or later
              </p>
              <a
                className="text-link"
                href={e.docs}
                target="_blank"
                rel="noreferrer"
              >
                Setup documentation
              </a>
              <p className="tiny">
                Add this endpoint to any available connection slot below.
                Discovery and permissions are still required.
              </p>
            </article>
          ))
      )}
      <p className="tiny muted">
        Custom · Connect any compatible remote MCP server in an available slot.
        You control its tools and permissions.
      </p>
    </section>
  );
}
