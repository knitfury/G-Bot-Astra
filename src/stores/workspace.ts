"use client";
import { demoStorage } from "@/lib/demo-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ThemeColor, Appearance, WorkspacePane } from "@/types/domain";
import { desktopCall, isDesktop } from "@/services/desktop/client";
import { resolveTheme } from "@/lib/theme";
interface WorkspaceState {
  color: ThemeColor;
  appearance: Appearance;
  reducedMotion: boolean;
  left: WorkspacePane;
  right: WorkspacePane;
  conversationId: string;
  model: string;
  drafts: Record<string, string>;
  setColor: (color: ThemeColor) => void;
  setAppearance: (appearance: Appearance) => void;
  setMotion: (value: boolean) => void;
  setPane: (side: "left" | "right", value: Partial<WorkspacePane>) => void;
  setConversation: (id: string) => void;
  setModel: (id: string) => void;
  setDraft: (id: string, value: string) => void;
}
export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      color: "orange",
      appearance: "light",
      reducedMotion: false,
      left: {
        side: "left",
        enabled: true,
        selectedConnectionId: "app-0",
        width: 280,
        collapsed: false,
      },
      right: {
        side: "right",
        enabled: true,
        selectedConnectionId: "app-2",
        width: 285,
        collapsed: false,
      },
      conversationId: "",
      model: "",
      drafts: {},
      setColor: (color) => set({ color }),
      setAppearance: (appearance) => set({ appearance }),
      setMotion: (reducedMotion) => set({ reducedMotion }),
      setPane: (side, value) =>
        set((state) => ({ [side]: { ...state[side], ...value } })),
      setConversation: (conversationId) => set({ conversationId }),
      setModel: (model) => set({ model }),
      setDraft: (id, value) =>
        set((state) => ({ drafts: { ...state.drafts, [id]: value } })),
    }),
    {
      name: "gbot-workspace-v1",
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (name) =>
          isDesktop()
            ? desktopCall("desktop.readPreferences")
            : demoStorage.getItem(name),
        setItem: (name, value) =>
          isDesktop()
            ? desktopCall("desktop.savePreferences", value)
            : demoStorage.setItem(name, value),
        removeItem: (name) =>
          isDesktop()
            ? desktopCall("desktop.savePreferences", null)
            : demoStorage.removeItem(name),
      })),
      migrate: (persisted) => {
        const { theme: _legacy, ...rest } = (persisted ?? {}) as Record<
          string,
          unknown
        >;
        return { ...rest, ...resolveTheme(persisted) };
      },
      merge: (persisted, current) => ({
        ...current,
        ...safeWorkspace(persisted),
        ...resolveTheme(persisted),
      }),
    },
  ),
);

function safeWorkspace(value: unknown): Partial<WorkspaceState> {
  if (!value || typeof value !== "object") return {};
  const v = value as Partial<WorkspaceState>,
    out: Partial<WorkspaceState> = {};
  if (typeof v.reducedMotion === "boolean") out.reducedMotion = v.reducedMotion;
  for (const key of ["conversationId", "model"] as const)
    if (typeof v[key] === "string") out[key] = v[key];
  if (v.drafts && typeof v.drafts === "object")
    out.drafts = Object.fromEntries(
      Object.entries(v.drafts).filter(([, draft]) => typeof draft === "string"),
    );
  for (const side of ["left", "right"] as const) {
    const p = v[side];
    if (p && typeof p === "object")
      out[side] = {
        side,
        enabled: typeof p.enabled === "boolean" ? p.enabled : true,
        collapsed: p.collapsed === true,
        width:
          typeof p.width === "number" && Number.isFinite(p.width)
            ? Math.max(240, Math.min(360, p.width))
            : side === "left"
              ? 280
              : 285,
        selectedConnectionId:
          typeof p.selectedConnectionId === "string"
            ? p.selectedConnectionId
            : "",
      };
  }
  return out;
}
