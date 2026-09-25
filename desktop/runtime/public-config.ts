import { z } from "zod";
const https = z
  .string()
  .url()
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.hash &&
      !u.search
    );
  });
const keys = z
  .string()
  .transform((value, ctx) => {
    try {
      const parsed: unknown = JSON.parse(value);
      return z.record(z.string(), z.string().max(10000)).parse(parsed);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid public key set" });
      return z.NEVER;
    }
  })
  .optional();
export const publicConfigSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: https.optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_GBOT_ENVIRONMENT: z
      .enum(["development", "staging", "production"])
      .optional(),
    GBOT_CONTROL_PLANE_URL: https.optional(),
    GBOT_LICENSE_PUBLIC_KEYS: keys,
    GBOT_CATALOG_PUBLIC_KEYS: keys,
    GBOT_UPDATE_PUBLIC_KEYS: keys,
    GBOT_RELEASE_MANIFEST_URL: https.optional(),
    GBOT_SENTRY_DSN: z.string().url().optional(),
  })
  .strict();
export function validatePublicConfig(raw: unknown): Record<string, string> {
  publicConfigSchema.parse(raw);
  // This allowlist is public configuration only. Private signing, service-role and billing keys never enter desktop builds.
  return raw as Record<string, string>;
}
