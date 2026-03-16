import { create } from "zustand";
import type { WorkspaceInfo } from "../lib/ipc";

interface WorkspaceState {
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string | null;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
  newSessionDialogOpen: boolean;
  deleteConfirmId: string | null;

  setWorkspaces: (workspaces: WorkspaceInfo[]) => void;
  addWorkspace: (workspace: WorkspaceInfo) => void;
  removeWorkspace: (workspaceId: string) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  updateWorkspace: (workspaceId: string, updates: Partial<WorkspaceInfo>) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setNewSessionDialogOpen: (open: boolean) => void;
  setDeleteConfirmId: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  activeWorkspaceId: null,
  sidebarOpen: true,
  settingsOpen: false,
  commandPaletteOpen: false,
  newSessionDialogOpen: false,
  deleteConfirmId: null,

  setWorkspaces: (workspaces) => set({ workspaces }),

  addWorkspace: (workspace) =>
    set((state) => ({
      workspaces: [...state.workspaces, workspace],
      activeWorkspaceId: workspace.id,
    })),

  removeWorkspace: (workspaceId) =>
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
      activeWorkspaceId:
        state.activeWorkspaceId === workspaceId
          ? state.workspaces.find((w) => w.id !== workspaceId)?.id ?? null
          : state.activeWorkspaceId,
      deleteConfirmId: null,
    })),

  setActiveWorkspace: (workspaceId) => set({ activeWorkspaceId: workspaceId }),

  updateWorkspace: (workspaceId, updates) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, ...updates } : w,
      ),
    })),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setNewSessionDialogOpen: (open) => set({ newSessionDialogOpen: open }),
  setDeleteConfirmId: (id) => set({ deleteConfirmId: id }),
}));
