import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  adminClient,
  required,
  origin,
  json,
  failure,
  HttpError,
} from "@/production/server/control";
import { noticeKind, notification } from "@/production/server/notifications";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const expected = Buffer.from(required("GBOT_MAINTENANCE_SECRET"));
    const actual = Buffer.from(
      req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "",
    );
    if (
      expected.length < 32 ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new HttpError(401, "Unauthorized maintenance request.");
    const db = adminClient();
    const pruned = await db.rpc("prune_metadata");
    if (pruned.error) throw pruned.error;
    if (process.env.GBOT_NOTIFICATIONS_ENABLED !== "true")
      return json({ pruned: true, delivery: "disabled" });
    const apiKey = required("BREVO_API_KEY"),
      accountOrigin = origin();
    const rows = await db.rpc("claim_notifications");
    if (rows.error) throw rows.error;
    let sent = 0,
      failed = 0;
    for (const row of rows.data ?? []) {
      try {
        let address: unknown = row.recipient;
        if (row.account_id) {
          const user = await db.auth.admin.getUserById(row.account_id);
          if (user.error) throw user.error;
          address = user.data.user.email;
        }
        const email = z.email().parse(address),
          kind = noticeKind.parse(row.kind);
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: { "api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "G-Bot", email: "no-reply@vidinex.ee" },
            to: [{ email }],
            ...notification(kind, accountOrigin),
            headers: { "Idempotency-Key": row.id },
          }),
        });
        if (!r.ok) throw Error("Delivery unavailable");
        const saved = await db
          .from("notification_outbox")
          .update({ sent_at: new Date().toISOString(), recipient: null })
          .eq("id", row.id)
          .eq("lease", row.lease);
        if (saved.error) throw saved.error;
        sent++;
      } catch {
        failed++;
      }
    }
    return json({ pruned: true, sent, failed });
  } catch (e) {
    return failure(e);
  }
}
