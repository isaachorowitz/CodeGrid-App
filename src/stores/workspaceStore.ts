import { create } from "zustand";
import type { WorkspaceInfo } from "../lib/ipc";
import { useSessionStore } from "./sessionStore";
import { useLayoutStore } from "./layoutStore";

export type ActivityPanel = "files" | "git" | "search" | "settings" | null;

interface WorkspaceState {
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string | null;
  sidebarOpen: boolean;
  activePanel: ActivityPanel;
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
  newSessionDialogOpen: boolean;
  deleteConfirmId: string | null;
  vibeMode: boolean;
  licenseDialogOpen: boolean;

  setWorkspaces: (workspaces: WorkspaceInfo[]) => void;
  addWorkspace: (workspace: WorkspaceInfo) => void;
  removeWorkspace: (workspaceId: string) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  updateWorkspace: (workspaceId: string, updates: Partial<WorkspaceInfo>) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActivePanel: (panel: ActivityPanel) => void;
  togglePanel: (panel: ActivityPanel) => void;
  setSettingsOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setNewSessionDialogOpen: (open: boolean) => void;
  setDeleteConfirmId: (id: string | null) => void;
  setVibeMode: (enabled: boolean) => void;
  setLicenseDialogOpen: (open: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  activeWorkspaceId: null,
  sidebarOpen: true,
  activePanel: "files" as ActivityPanel,
  settingsOpen: false,
  commandPaletteOpen: false,
  newSessionDialogOpen: false,
  deleteConfirmId: null,
  vibeMode: false,
  licenseDialogOpen: false,

  setWorkspaces: (workspaces) => set({ workspaces }),

  addWorkspace: (workspace) =>
    set((state) => ({
      workspaces: [...state.workspaces, workspace],
      activeWorkspaceId: workspace.id,
    })),

  removeWorkspace: (workspaceId) => {
    // Clean up sessions and layouts belonging to this workspace
    const removedSessionIds = useSessionStore.getState().removeWorkspaceSessions(workspaceId);
    const { removePaneLayout } = useLayoutStore.getState();
    for (const sid of removedSessionIds) {
      removePaneLayout(sid);
    }

    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
      activeWorkspaceId:
        state.activeWorkspaceId === workspaceId
          ? state.workspaces.find((w) => w.id !== workspaceId)?.id ?? null
          : state.activeWorkspaceId,
      deleteConfirmId: null,
    }));
  },

  setActiveWorkspace: (workspaceId) => set({ activeWorkspaceId: workspaceId }),

  updateWorkspace: (workspaceId, updates) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, ...updates } : w,
      ),
    })),

  toggleSidebar: () => set((state) => {
    if (state.sidebarOpen) {
      return { sidebarOpen: false };
    }
    return { sidebarOpen: true, activePanel: state.activePanel ?? "files" };
  }),
  setSidebarOpen: (open) => set((state) => ({
    sidebarOpen: open,
    activePanel: open ? (state.activePanel ?? "files") : state.activePanel,
  })),
  setActivePanel: (panel) => set({
    activePanel: panel,
    sidebarOpen: panel !== null,
  }),
  togglePanel: (panel) => set((state) => {
    if (state.activePanel === panel && state.sidebarOpen) {
      return { sidebarOpen: false };
    }
    return { activePanel: panel, sidebarOpen: true };
  }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setNewSessionDialogOpen: (open) => set({ newSessionDialogOpen: open }),
  setDeleteConfirmId: (id) => set({ deleteConfirmId: id }),
  setVibeMode: (enabled) => set({ vibeMode: enabled }),
  setLicenseDialogOpen: (open) => set({ licenseDialogOpen: open }),
}));
