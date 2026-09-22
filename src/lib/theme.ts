import type { Appearance, ThemeColor } from "../types/domain";

export const themeColors = [
  "orange",
  "purple",
  "blue",
  "green",
  "neutral",
] as const;
export const appearances = ["light", "dark"] as const;
export interface ThemePreference {
  color: ThemeColor;
  appearance: Appearance;
}

/** Normalize current preferences and migrate the six original theme identities. */
export function resolveTheme(value: unknown): ThemePreference {
  const state =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  if (themeColors.includes(state.color as ThemeColor)) {
    return {
      color: state.color as ThemeColor,
      appearance: state.appearance === "dark" ? "dark" : "light",
    };
  }
  switch (state.theme) {
    case "purple":
      return { color: "purple", appearance: "dark" };
    case "dark":
      return { color: "neutral", appearance: "dark" };
    case "white":
      return { color: "neutral", appearance: "light" };
    case "blue":
    case "green":
      return { color: state.theme, appearance: "light" };
    default:
      return { color: "orange", appearance: "light" };
  }
}
