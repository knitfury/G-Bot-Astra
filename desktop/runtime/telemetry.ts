import * as Sentry from "@sentry/node";
import { z } from "zod";
import { randomUUID } from "node:crypto";
const safe = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    platform: z.enum(["win32", "darwin", "linux"]),
    component: z.enum([
      "desktop",
      "auth",
      "billing",
      "license",
      "catalog",
      "storage",
      "update",
    ]),
    category: z.enum([
      "unavailable",
      "invalid",
      "denied",
      "failure",
      "success",
    ]),
    session: z.string().uuid(),
  })
  .strip();
export function sanitizedTelemetry(input: unknown) {
  return safe.parse(input);
}
export class SafeTelemetry {
  private readonly session = randomUUID();
  private ready = false;
  constructor(
    private dsn: string | undefined,
    private enabled: () => boolean,
  ) {}
  record(
    component: "desktop" | "storage" | "update",
    category: "failure" | "success",
  ) {
    if (!this.enabled() || !this.dsn) return;
    if (!this.ready) {
      Sentry.init({
        dsn: this.dsn,
        defaultIntegrations: false,
        includeServerName: false,
        tracesSampleRate: 0,
        beforeSend: (event) => {
          const parsed = safe.safeParse(event.extra);
          if (!parsed.success) return null;
          return {
            type: event.type,
            event_id: event.event_id,
            timestamp: event.timestamp,
            level: "error",
            message: "G-Bot diagnostic event",
            extra: parsed.data,
          };
        },
      });
      this.ready = true;
    }
    Sentry.captureEvent({
      message: "G-Bot diagnostic event",
      extra: sanitizedTelemetry({
        version: "1.0.0",
        platform: process.platform,
        component,
        category,
        session: this.session,
      }),
    });
  }
}
