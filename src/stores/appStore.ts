import { create } from "zustand";
import type { SkillInfo, ModelInfo } from "../lib/ipc";

interface AppState {
  skills: SkillInfo[];
  models: ModelInfo[];
  recentDirs: string[];
  defaultModel: string;
  skillsPanelOpen: boolean;
  hubBrowserOpen: boolean;

  setSkills: (skills: SkillInfo[]) => void;
  setModels: (models: ModelInfo[]) => void;
  setRecentDirs: (dirs: string[]) => void;
  setDefaultModel: (model: string) => void;
  setSkillsPanelOpen: (open: boolean) => void;
  setHubBrowserOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  skills: [],
  models: [],
  recentDirs: [],
  defaultModel: "claude-sonnet-4-6",
  skillsPanelOpen: false,
  hubBrowserOpen: false,

  setSkills: (skills) => set({ skills }),
  setModels: (models) => set({ models }),
  setRecentDirs: (dirs) => set({ recentDirs: dirs }),
  setDefaultModel: (model) => set({ defaultModel: model }),
  setSkillsPanelOpen: (open) => set({ skillsPanelOpen: open }),
  setHubBrowserOpen: (open) => set({ hubBrowserOpen: open }),
}));
