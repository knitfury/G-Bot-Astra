"use client";
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
            : localStorage.getItem(name),
        setItem: (name, value) =>
          isDesktop()
            ? desktopCall("desktop.savePreferences", value)
            : localStorage.setItem(name, value),
        removeItem: (name) =>
          isDesktop()
            ? desktopCall("desktop.savePreferences", null)
            : localStorage.removeItem(name),
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
        ...(persisted as object),
        ...resolveTheme(persisted),
      }),
    },
  ),
);
