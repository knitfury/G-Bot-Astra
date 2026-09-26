import type { Database } from "../types/domain";
import { auditAvailable } from "./entitlements";
export function exportAudit(db: Database) {
  if (!auditAvailable(db.entitlement))
    throw new Error("Advanced Activity & Audit requires Business.");
  return JSON.stringify(
    {
      format: "g-bot-activity-audit",
      version: 1,
      exportedAt: new Date().toISOString(),
      activity: db.activity,
      approvals: db.approvals.map((a) => ({
        id: a.id,
        conversationId: a.conversationId,
        connectionId: a.connectionId,
        toolId: a.toolId,
        action: a.action,
        status: a.status,
        executionState: a.executionState,
        createdAt: a.createdAt,
        resolvedAt: a.resolvedAt,
      })),
    },
    null,
    2,
  );
}
export function retainActivity(db: Database, now = Date.now()) {
  const days = db.preferences.activityRetention;
  if (!auditAvailable(db.entitlement) || !days) return;
  db.activity = db.activity.filter(
    (a) => Date.parse(a.timestamp) >= now - days * 86400000,
  );
}
