import type { Preferences } from "@/types/domain";
export function normalizePreferences(value: unknown): Preferences {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: Preferences = {
    startup: true,
    notifications: true,
    activityVisible: true,
  };
  for (const key of [
    "startup",
    "notifications",
    "activityVisible",
    "diagnosticsConsent",
  ] as const)
    if (typeof v[key] === "boolean") result[key] = v[key];
  for (const key of ["historyRetention", "activityRetention"] as const)
    if ([0, 30, 90, 180].includes(v[key] as number))
      result[key] = v[key] as 0 | 30 | 90 | 180;
  if (
    Number.isInteger(v.onboardingStep) &&
    Number(v.onboardingStep) >= 0 &&
    Number(v.onboardingStep) <= 6
  )
    result.onboardingStep = Number(v.onboardingStep);
  return result;
}

export function normalizeDiagnostics(
  value: unknown,
): import("@/types/domain").Diagnostics {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    offline: v.offline === true,
    inventoryFailure: v.inventoryFailure === true,
    toolFailure: v.toolFailure === true,
    providerFailure: v.providerFailure === true,
    oauthFailure: v.oauthFailure === true,
    noTools: v.noTools === true,
    authFailure:
      v.authFailure === "credentials" || v.authFailure === "network"
        ? v.authFailure
        : "none",
  };
}
