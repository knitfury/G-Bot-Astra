import { z } from "zod";
import type { Operation } from "../../src/services/desktop/protocol";
const text = z.string().max(200_000),
  short = z.string().max(500),
  id = z.string().min(1).max(500),
  empty = z.tuple([]);
const provider = z
  .object({
    name: short.min(1),
    type: z.enum([
      "OpenAI-compatible",
      "Anthropic-compatible",
      "Gemini-compatible",
      "Custom OpenAI-compatible",
      "Generic REST",
    ]),
    baseUrl: short,
    key: z.string().max(16000),
    model: short.min(1),
    headers: z.string().max(16000),
    method: z.enum(["POST", "GET"]),
    auth: z.enum(["Bearer", "API key", "None"]),
    body: z.string().max(50000),
    inputPath: short,
    responsePath: short,
    tools: z.boolean(),
  })
  .strict();
const attachment = z
  .object({
    id,
    kind: z.enum(["file", "image", "URL"]),
    name: short,
    size: z
      .number()
      .nonnegative()
      .max(50 * 1024 * 1024),
    mime: short,
    url: z.string().max(4000).optional(),
    preview: z.string().max(3_000_000).optional(),
    status: z.enum(["processing", "ready", "unsupported", "failed"]),
    error: short.optional(),
  })
  .strict();
const input = z
  .object({
    name: short.min(1),
    url: short,
    category: z.enum([
      "Email",
      "CRM",
      "Inventory",
      "Accounting",
      "Helpdesk",
      "Calendar",
      "Documents",
      "Projects", "Ecommerce", "Shipping", "Logistics", "Custom",
    ]),
    auth: z.enum(["OAuth", "Token", "None"]),
    slot: z.number().int().min(0).max(7),
    token: z.string().max(16000).optional(),
    headers: z.string().max(16000).optional(),
    authHeader: short.optional(),
    oauthClientId: short.optional(),
  })
  .strict();
export const schemas: Record<Operation, z.ZodType> = {
  snapshot: empty,
  "auth.login": z.tuple([short, short]),
  "auth.signup": z.tuple([short, short, short]),
  "auth.logout": empty,
  "auth.resetPassword": z.tuple([short]),
  "auth.demo": empty,
  "account.get": empty,
  "account.update": z.tuple([short]),
  "account.clearHistory": empty,
  "account.reset": empty,
  "account.preferences": z.tuple([
    z
      .object({
        historyRetention: z.union([z.literal(0),z.literal(30),z.literal(90),z.literal(180)]).optional(),
        diagnosticsConsent: z.boolean().optional(),
        onboardingStep: z.number().int().min(0).max(6).optional(),
        startup: z.boolean().optional(),
        notifications: z.boolean().optional(),
        activityVisible: z.boolean().optional(),
      })
      .strict(),
  ]),
  "entitlements.get": empty,
  "entitlements.change": z.tuple([z.enum(["free", "starter", "business"])]),
  "entitlements.expire": z.tuple([z.boolean()]),
  "providers.list": empty,
  "providers.test": z.tuple([provider]),
  "providers.save": z.tuple([provider, id.optional()]),
  "providers.testSaved": z.tuple([id]),
  "providers.remove": z.tuple([id]),
  "connections.snapshot": z.tuple([id, z.boolean().optional()]),
  "tools.selectAll": z.tuple([id, z.boolean()]),
  "connections.list": empty,
  "connections.save": z.tuple([input, id.optional()]),
  "connections.connect": z.tuple([id, z.boolean()]),
  "connections.disconnect": z.tuple([id]),
  "connections.remove": z.tuple([id]),
  "connections.records": z.tuple([input.shape.category]),
  "tools.toggle": z.tuple([id, id, z.boolean()]),
  "conversations.list": empty,
  "conversations.create": z.tuple([short]),
  "conversations.rename": z.tuple([id, short]),
  "conversations.remove": z.tuple([id]),
  "conversations.feedback": z.tuple([id, id, z.enum(["up", "down"])]),
  "execution.run": z.tuple([id, text, short, z.array(attachment).max(5)]),
  "execution.stop": z.tuple([id]),
  "execution.retry": z.tuple([id]),
  "approvals.resolve": z.tuple([
    id,
    z.boolean(),
    z
      .object({ recipient: text, subject: text, body: text })
      .strict()
      .optional(),
  ]),
  "activity.list": empty,
  "attachments.process": z.tuple([
    z
      .object({
        name: short,
        type: short,
        bytes: z.array(z.number().int().min(0).max(255)).max(50 * 1024 * 1024),
      })
      .strict(),
  ]),
  "attachments.url": z.tuple([z.string().max(4000)]),
  "secureStorage.clear": empty,
  "secureStorage.status": empty,
  "updates.check": empty,
  "updates.download": empty,
  "diagnostics.set": z.tuple([
    z.record(z.string(), z.union([z.string(), z.boolean()])),
  ]),
  "desktop.pickFiles": empty,
  "desktop.readPreferences": empty,
  "desktop.savePreferences": z.tuple([z.string().max(500_000).nullable()]),
  "desktop.installUpdate": empty,
  "desktop.signIn": z.tuple([z.enum(["google","azure"])]),
  "desktop.verifyMfa": z.tuple([z.string().regex(/^\d{6}$/)]),
  "desktop.refreshLicense": empty,
  "desktop.openAccount": empty,
  "desktop.catalog": empty,
  "desktop.data": z.tuple([z.enum(["usage","clear-cache","clear-activity","backup","restore","json","markdown"]), z.string().max(1024)]),
  "desktop.retention": z.tuple([z.union([z.literal(0),z.literal(30),z.literal(90),z.literal(180)])]),
  "desktop.openDemo": empty,
  "desktop.diagnostics": empty,
};
export function validateOperation(
  operation: unknown,
  args: unknown,
): { operation: Operation; args: unknown[] } {
  if (typeof operation !== "string" || !Object.hasOwn(schemas, operation))
    throw new Error("Operation not allowed.");
  const result = schemas[operation as Operation].safeParse(args);
  if (!result.success) throw new Error("Invalid desktop request.");
  return { operation: operation as Operation, args: result.data as unknown[] };
}
export function trustedSender(
  senderId: number,
  windowId: number,
  frameUrl: string,
  origin: string,
  isMainFrame: boolean,
) {
  return (
    senderId === windowId && isMainFrame && new URL(frameUrl).origin === origin
  );
}
