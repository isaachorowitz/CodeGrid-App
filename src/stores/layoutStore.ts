import { create } from "zustand";
import type { Layout } from "react-grid-layout";

export type PresetLayout = "1x1" | "2x2" | "3x3" | "1+2" | "1+3";

interface LayoutState {
  layouts: Layout[];
  maximizedPane: string | null;
  savedLayouts: Layout[];  // Store layouts before maximize

  setLayouts: (layouts: Layout[]) => void;
  addPaneLayout: (sessionId: string) => void;
  removePaneLayout: (sessionId: string) => void;
  applyPreset: (preset: PresetLayout, sessionIds: string[]) => void;
  toggleMaximize: (sessionId: string) => void;
  swapPanes: (id1: string, id2: string) => void;
}

function generatePresetLayout(preset: PresetLayout, sessionIds: string[]): Layout[] {
  switch (preset) {
    case "1x1":
      return sessionIds.slice(0, 1).map((id) => ({
        i: id, x: 0, y: 0, w: 12, h: 12,
      }));
    case "2x2":
      return sessionIds.slice(0, 4).map((id, idx) => ({
        i: id,
        x: (idx % 2) * 6,
        y: Math.floor(idx / 2) * 6,
        w: 6,
        h: 6,
      }));
    case "3x3":
      return sessionIds.slice(0, 9).map((id, idx) => ({
        i: id,
        x: (idx % 3) * 4,
        y: Math.floor(idx / 3) * 4,
        w: 4,
        h: 4,
      }));
    case "1+2":
      return sessionIds.slice(0, 3).map((id, idx) => {
        if (idx === 0) return { i: id, x: 0, y: 0, w: 8, h: 12 };
        return { i: id, x: 8, y: (idx - 1) * 6, w: 4, h: 6 };
      });
    case "1+3":
      return sessionIds.slice(0, 4).map((id, idx) => {
        if (idx === 0) return { i: id, x: 0, y: 0, w: 12, h: 8 };
        return { i: id, x: (idx - 1) * 4, y: 8, w: 4, h: 4 };
      });
    default:
      return [];
  }
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layouts: [],
  maximizedPane: null,
  savedLayouts: [],

  setLayouts: (layouts) => set({ layouts }),

  addPaneLayout: (sessionId) =>
    set((state) => {
      const existingCount = state.layouts.length;
      // Auto-arrange: put new pane in next available slot
      const cols = existingCount < 4 ? 2 : 3;
      const w = Math.floor(12 / cols);
      const h = 6;
      const x = (existingCount % cols) * w;
      const y = Math.floor(existingCount / cols) * h;

      return {
        layouts: [
          ...state.layouts,
          { i: sessionId, x, y, w, h, minW: 2, minH: 2 },
        ],
      };
    }),

  removePaneLayout: (sessionId) =>
    set((state) => ({
      layouts: state.layouts.filter((l) => l.i !== sessionId),
      maximizedPane:
        state.maximizedPane === sessionId ? null : state.maximizedPane,
    })),

  applyPreset: (preset, sessionIds) =>
    set({
      layouts: generatePresetLayout(preset, sessionIds),
      maximizedPane: null,
    }),

  toggleMaximize: (sessionId) =>
    set((state) => {
      if (state.maximizedPane === sessionId) {
        // Restore
        return {
          maximizedPane: null,
          layouts: state.savedLayouts.length > 0 ? state.savedLayouts : state.layouts,
          savedLayouts: [],
        };
      }
      // Maximize
      return {
        maximizedPane: sessionId,
        savedLayouts: state.layouts,
        layouts: state.layouts.map((l) =>
          l.i === sessionId
            ? { ...l, x: 0, y: 0, w: 12, h: 12 }
            : { ...l, w: 0, h: 0 },
        ),
      };
    }),

  swapPanes: (id1, id2) =>
    set((state) => {
      const l1 = state.layouts.find((l) => l.i === id1);
      const l2 = state.layouts.find((l) => l.i === id2);
      if (!l1 || !l2) return state;

      return {
        layouts: state.layouts.map((l) => {
          if (l.i === id1) return { ...l, x: l2.x, y: l2.y, w: l2.w, h: l2.h };
          if (l.i === id2) return { ...l, x: l1.x, y: l1.y, w: l1.w, h: l1.h };
          return l;
        }),
      };
    }),
}));
