import { create } from "zustand";
import type { Layout } from "react-grid-layout";

export type PresetLayout = "1x1" | "2x2" | "3x3" | "1+2" | "1+3";

/** Saved layout info for a minimized pane so we can restore it later */
interface MinimizedPaneInfo {
  layout: Layout;
}

interface LayoutState {
  layouts: Layout[];
  maximizedPane: string | null;
  savedLayouts: Layout[];  // Store layouts before maximize
  minimizedPanes: Record<string, MinimizedPaneInfo>;  // pane id -> saved info

  setLayouts: (layouts: Layout[]) => void;
  addPaneLayout: (sessionId: string) => void;
  removePaneLayout: (sessionId: string) => void;
  applyPreset: (preset: PresetLayout, sessionIds: string[]) => void;
  toggleMaximize: (sessionId: string) => void;
  swapPanes: (id1: string, id2: string) => void;
  minimizePane: (sessionId: string) => void;
  restorePane: (sessionId: string) => void;
  isMinimized: (sessionId: string) => boolean;
  autoLayout: (sessionIds: string[]) => void;
}

/** Clamp a layout item so it stays within the 12-col, 12-row grid */
function clampLayout(l: Layout): Layout {
  const w = Math.max(l.w, l.minW ?? 2);
  const h = Math.max(l.h, l.minH ?? 2);
  const x = Math.max(0, Math.min(l.x, 12 - w));
  const y = Math.max(0, Math.min(l.y, 12 - h));
  return { ...l, x, y, w, h };
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function sanitizeLayouts(raw: unknown): Layout[] {
  if (!Array.isArray(raw)) return [];
  const out: Layout[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.i !== "string" || obj.i.length === 0) continue;
    const layout: Layout = {
      i: obj.i,
      x: toFiniteNumber(obj.x, 0),
      y: toFiniteNumber(obj.y, 0),
      w: toFiniteNumber(obj.w, 4),
      h: toFiniteNumber(obj.h, 4),
      minW: toFiniteNumber(obj.minW, 2),
      minH: toFiniteNumber(obj.minH, 2),
    };
    out.push(clampLayout(layout));
  }
  return out;
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

/**
 * Compute an auto-layout grid for N visible panes.
 * - 1 terminal: full screen
 * - 2 terminals: side by side (50/50)
 * - 3 terminals: 2 on top, 1 full-width bottom
 * - 4 terminals: 2x2 grid
 * - 5-6 terminals: 2 rows of 3
 * - 7-9 terminals: 3x3 grid
 */
function computeAutoLayout(sessionIds: string[]): Layout[] {
  const n = sessionIds.length;
  if (n === 0) return [];

  if (n === 1) {
    return [{ i: sessionIds[0], x: 0, y: 0, w: 12, h: 12, minW: 2, minH: 2 }];
  }
  if (n === 2) {
    return sessionIds.map((id, idx) => ({
      i: id, x: idx * 6, y: 0, w: 6, h: 12, minW: 2, minH: 2,
    }));
  }
  if (n === 3) {
    return [
      { i: sessionIds[0], x: 0, y: 0, w: 6, h: 6, minW: 2, minH: 2 },
      { i: sessionIds[1], x: 6, y: 0, w: 6, h: 6, minW: 2, minH: 2 },
      { i: sessionIds[2], x: 0, y: 6, w: 12, h: 6, minW: 2, minH: 2 },
    ];
  }
  if (n === 4) {
    return sessionIds.map((id, idx) => ({
      i: id, x: (idx % 2) * 6, y: Math.floor(idx / 2) * 6, w: 6, h: 6, minW: 2, minH: 2,
    }));
  }
  if (n <= 6) {
    return sessionIds.map((id, idx) => ({
      i: id, x: (idx % 3) * 4, y: Math.floor(idx / 3) * 6, w: 4, h: 6, minW: 2, minH: 2,
    }));
  }
  // 7-9: 3x3
  return sessionIds.map((id, idx) => ({
    i: id, x: (idx % 3) * 4, y: Math.floor(idx / 3) * 4, w: 4, h: 4, minW: 2, minH: 2,
  }));
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layouts: [],
  maximizedPane: null,
  savedLayouts: [],
  minimizedPanes: {},

  setLayouts: (layouts) => set({ layouts: layouts.map(clampLayout) }),

  addPaneLayout: (sessionId) =>
    set((state) => {
      // Count only non-minimized layouts for placement
      const visibleCount = state.layouts.filter(
        (l) => !state.minimizedPanes[l.i],
      ).length;
      const cols = visibleCount < 4 ? 2 : 3;
      const w = Math.floor(12 / cols);
      const h = 6;
      const x = (visibleCount % cols) * w;
      const y = Math.floor(visibleCount / cols) * h;

      const newLayout = clampLayout({ i: sessionId, x, y, w, h, minW: 2, minH: 2 });

      return {
        layouts: [...state.layouts, newLayout],
      };
    }),

  removePaneLayout: (sessionId) =>
    set((state) => {
      const newMinimized = { ...state.minimizedPanes };
      delete newMinimized[sessionId];
      return {
        layouts: state.layouts.filter((l) => l.i !== sessionId),
        maximizedPane:
          state.maximizedPane === sessionId ? null : state.maximizedPane,
        minimizedPanes: newMinimized,
      };
    }),

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

  minimizePane: (sessionId) =>
    set((state) => {
      const existing = state.layouts.find((l) => l.i === sessionId);
      if (!existing) return state;
      // Already minimized?
      if (state.minimizedPanes[sessionId]) return state;
      return {
        minimizedPanes: {
          ...state.minimizedPanes,
          [sessionId]: { layout: { ...existing } },
        },
        // Remove from grid layouts so the pane is no longer rendered in the grid
        layouts: state.layouts.filter((l) => l.i !== sessionId),
        maximizedPane:
          state.maximizedPane === sessionId ? null : state.maximizedPane,
      };
    }),

  restorePane: (sessionId) =>
    set((state) => {
      const info = state.minimizedPanes[sessionId];
      if (!info) return state;
      const newMinimized = { ...state.minimizedPanes };
      delete newMinimized[sessionId];
      return {
        minimizedPanes: newMinimized,
        layouts: [...state.layouts, clampLayout(info.layout)],
      };
    }),

  isMinimized: (sessionId) => !!get().minimizedPanes[sessionId],

  autoLayout: (sessionIds) =>
    set((state) => {
      // Only layout non-minimized panes; keep minimized panes minimized
      const visibleIds = sessionIds.filter((id) => !state.minimizedPanes[id]);
      const autoLayouts = computeAutoLayout(visibleIds);
      return {
        layouts: autoLayouts,
        maximizedPane: null,
      };
    }),
}));
