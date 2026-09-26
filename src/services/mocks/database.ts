import { reconcileConnections } from "@/lib/entitlements";
import type { Database } from "@/types/domain";
import { initialDatabase } from "@/data/mocks/seed";
let db: Database = initialDatabase();
const listeners = new Set<() => void>();
let hydrated = false;
export const get = () => db;
export function persist() {
  reconcileConnections(db.entitlement, db.connections);
  db = { ...db, revision: db.revision + 1 };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("gbot-demo-v1", JSON.stringify(db));
    } catch {
      /* Session remains usable if storage is full or disabled. */
    }
  }
  listeners.forEach((fn) => fn());
}
export function replace(value: Database) {
  db = value;
  persist();
}
export function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const saved = localStorage.getItem("gbot-demo-v1");
    if (saved) {
      const parsed = JSON.parse(saved) as Database;
      if (parsed.schema === 1) {
        db = parsed;
        for (const c of db.conversations) {
          for (const m of c.messages) {
            if (m.status === "running") {
              m.status = "cancelled";
              m.content +=
                "\n\nThe previous run was interrupted. Choose Retry to continue.";
              m.tools.forEach((t) => {
                if (t.status === "running" || t.status === "queued")
                  t.status = "cancelled";
              });
            }
          }
        }
        for (const c of db.connections) {
          if (c.status === "connecting") {
            c.status = "disconnected";
            c.enabled = false;
          }
        }
        if (db.updateStatus === "downloading") db.updateStatus = "available";
      }
    }
  } catch {
    db = initialDatabase();
  }
  persist();
}
export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const delay = (ms = 350) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export async function online() {
  await delay();
  if (db.diagnostics.offline)
    throw new Error(
      "You are offline in this simulation. Turn off offline mode in Settings to reconnect.",
    );
}
