import { create } from "zustand";
import type { SkillInfo, ModelInfo } from "../lib/ipc";

interface AppState {
  skills: SkillInfo[];
  models: ModelInfo[];
  recentDirs: string[];
  defaultModel: string;
  skillsPanelOpen: boolean;
  hubBrowserOpen: boolean;
  gitManagerOpen: boolean;
  mcpManagerOpen: boolean;
  claudeMdEditorOpen: boolean;
  gitManagerDir: string | null;
  mcpManagerDir: string | null;
  claudeMdDir: string | null;

  setSkills: (skills: SkillInfo[]) => void;
  setModels: (models: ModelInfo[]) => void;
  setRecentDirs: (dirs: string[]) => void;
  setDefaultModel: (model: string) => void;
  setSkillsPanelOpen: (open: boolean) => void;
  setHubBrowserOpen: (open: boolean) => void;
  setGitManagerOpen: (open: boolean, dir?: string) => void;
  setMcpManagerOpen: (open: boolean, dir?: string) => void;
  setClaudeMdEditorOpen: (open: boolean, dir?: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  skills: [],
  models: [],
  recentDirs: [],
  defaultModel: "claude-sonnet-4-6",
  skillsPanelOpen: false,
  hubBrowserOpen: false,
  gitManagerOpen: false,
  mcpManagerOpen: false,
  claudeMdEditorOpen: false,
  gitManagerDir: null,
  mcpManagerDir: null,
  claudeMdDir: null,

  setSkills: (skills) => set({ skills }),
  setModels: (models) => set({ models }),
  setRecentDirs: (dirs) => set({ recentDirs: dirs }),
  setDefaultModel: (model) => set({ defaultModel: model }),
  setSkillsPanelOpen: (open) => set({ skillsPanelOpen: open }),
  setHubBrowserOpen: (open) => set({ hubBrowserOpen: open }),
  setGitManagerOpen: (open, dir) => set({ gitManagerOpen: open, gitManagerDir: dir ?? null }),
  setMcpManagerOpen: (open, dir) => set({ mcpManagerOpen: open, mcpManagerDir: dir ?? null }),
  setClaudeMdEditorOpen: (open, dir) => set({ claudeMdEditorOpen: open, claudeMdDir: dir ?? null }),
}));
