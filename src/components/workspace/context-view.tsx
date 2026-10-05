"use client";
import type { BusinessSnapshot, SnapshotItem } from "@/types/snapshot";
export function ContextView({
  snapshot,
  items,
  select,
  selected,
}: {
  snapshot: BusinessSnapshot;
  items: SnapshotItem[];
  select: (id: string) => void;
  selected?: string;
}) {
  const type = snapshot.presentation?.type ?? "list";
  const fields = snapshot.presentation?.fields ?? [];
  if (type === "document")
    return (
      <div className="context-documents">
        {items.map((i) => (
          <article key={i.id}>
            <h3>{i.title}</h3>
            <pre className="context-document">{i.preview}</pre>
          </article>
        ))}
      </div>
    );
  if (type === "table")
    return (
      <div
        className="context-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Business context table"
      >
        <table className="context-table">
          <thead>
            <tr>
              {fields.map((f) => (
                <th scope="col" key={f.key}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                {fields.map((f, index) => (
                  <td key={f.key}>
                    {index === 0 ? (
                      <button
                        className="text-link"
                        onClick={() => select(i.id)}
                      >
                        {i.values?.[f.key] ?? "—"}
                      </button>
                    ) : (
                      (i.values?.[f.key] ?? "—")
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (type === "metrics")
    return (
      <dl className="context-grid">
        {items.flatMap((i) =>
          fields.map((f) => (
            <div className="context-metric" key={`${i.id}:${f.key}`}>
              <dt>{f.label}</dt>
              <dd>{i.values?.[f.key]}</dd>
            </div>
          )),
        )}
      </dl>
    );
  if (type === "detail" || type === "key-value")
    return (
      <div>
        {items.map((i) => (
          <dl className="context-key-values" key={i.id}>
            {Object.entries(i.fields).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    );
  return (
    <div
      className={type === "cards" ? "context-grid" : "snapshot-list"}
      role="list"
      aria-label={`${type} context`}
    >
      {items.map((i) => (
        <div role="listitem" key={i.id}>
          <button
            className="snapshot-item"
            aria-pressed={selected === i.id}
            onClick={() => select(i.id)}
          >
            <strong
              className={
                snapshot.kind === "inventory" ? "context-content" : undefined
              }
            >
              {i.title}
            </strong>
            <p
              className={
                snapshot.kind === "mail" || snapshot.kind === "inventory"
                  ? "context-content"
                  : undefined
              }
            >
              {i.subtitle}
            </p>
            {(type === "messages" || type === "cards") && (
              <p className="context-content">{i.preview}</p>
            )}
            {type === "timeline" &&
              fields
                .filter((f) => f.role === "timestamp")
                .map((f) => <p key={f.key}>{i.values?.[f.key]}</p>)}
            {i.fields.Stock !== undefined && <p>{i.fields.Stock} in stock</p>}
            {i.status && <span>{i.status}</span>}
            {type === "cards" &&
              fields
                .filter((f) => f.role === "amount" || f.role === "currency")
                .map((f) => (
                  <span key={f.key}>
                    {" "}
                    {f.label}: {i.values?.[f.key]}
                  </span>
                ))}
          </button>
        </div>
      ))}
    </div>
  );
}
