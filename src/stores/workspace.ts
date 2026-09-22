"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Theme, WorkspacePane } from "@/types/domain";
interface WorkspaceState {
  theme: Theme;
  reducedMotion: boolean;
  left: WorkspacePane;
  right: WorkspacePane;
  conversationId: string;
  model: string;
  drafts: Record<string, string>;
  setTheme: (theme: Theme) => void;
  setMotion: (value: boolean) => void;
  setPane: (side: "left" | "right", value: Partial<WorkspacePane>) => void;
  setConversation: (id: string) => void;
  setModel: (id: string) => void;
  setDraft: (id: string, value: string) => void;
}
export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      theme: "orange",
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
      setTheme: (theme) => set({ theme }),
      setMotion: (reducedMotion) => set({ reducedMotion }),
      setPane: (side, value) =>
        set((state) => ({ [side]: { ...state[side], ...value } })),
      setConversation: (conversationId) => set({ conversationId }),
      setModel: (model) => set({ model }),
      setDraft: (id, value) =>
        set((state) => ({ drafts: { ...state.drafts, [id]: value } })),
    }),
    { name: "gbot-workspace-v1" },
  ),
);
