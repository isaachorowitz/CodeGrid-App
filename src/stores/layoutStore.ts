import { create } from "zustand";

export interface CanvasLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PresetLayout = "1x1" | "2x2" | "3x3" | "1+2" | "1+3";

const MIN_W = 200;
const MIN_H = 150;
const DEFAULT_W = 600;
const DEFAULT_H = 400;
const CASCADE_OFFSET = 30;

/** Saved layout info for a minimized pane so we can restore it later */
interface MinimizedPaneInfo {
  layout: CanvasLayout;
}

interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
  locked: boolean;
}

interface LayoutState {
  layouts: CanvasLayout[];
  canvas: CanvasState;
  maximizedPane: string | null;
  savedLayouts: CanvasLayout[];
  minimizedPanes: Record<string, MinimizedPaneInfo>;

  setLayouts: (layouts: CanvasLayout[]) => void;
  addPaneLayout: (sessionId: string) => void;
  removePaneLayout: (sessionId: string) => void;
  applyPreset: (preset: PresetLayout, sessionIds: string[], viewportW?: number, viewportH?: number) => void;
  toggleMaximize: (sessionId: string) => void;
  swapPanes: (id1: string, id2: string) => void;
  minimizePane: (sessionId: string) => void;
  restorePane: (sessionId: string) => void;
  isMinimized: (sessionId: string) => boolean;
  autoLayout: (sessionIds: string[], viewportW?: number, viewportH?: number) => void;

  // Canvas actions
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  toggleLocked: () => void;
  setCanvas: (canvas: Partial<CanvasState>) => void;
  zoomToFit: (viewportW: number, viewportH: number) => void;
  updatePaneLayout: (id: string, update: Partial<CanvasLayout>) => void;
}

function enforceMinSize(l: CanvasLayout): CanvasLayout {
  return {
    ...l,
    w: Math.max(l.w, MIN_W),
    h: Math.max(l.h, MIN_H),
  };
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Detect old 12x12 grid format: all x/y/w/h values are in 0-12 range */
function isOldGridFormat(layouts: unknown[]): boolean {
  if (layouts.length === 0) return false;
  return layouts.every((item) => {
    if (!item || typeof item !== "object") return false;
    const obj = item as Record<string, unknown>;
    const x = typeof obj.x === "number" ? obj.x : -1;
    const y = typeof obj.y === "number" ? obj.y : -1;
    const w = typeof obj.w === "number" ? obj.w : -1;
    const h = typeof obj.h === "number" ? obj.h : -1;
    return x >= 0 && x <= 12 && y >= 0 && y <= 12 && w >= 0 && w <= 12 && h >= 0 && h <= 12;
  });
}

/** Migrate old 12-col grid layout to pixel coords */
function migrateFromGrid(raw: Record<string, unknown>[], viewportW: number, viewportH: number): CanvasLayout[] {
  const colW = viewportW / 12;
  const rowH = viewportH / 12;
  return raw.map((obj) => enforceMinSize({
    i: String(obj.i),
    x: toFiniteNumber(obj.x, 0) * colW,
    y: toFiniteNumber(obj.y, 0) * rowH,
    w: toFiniteNumber(obj.w, 4) * colW,
    h: toFiniteNumber(obj.h, 4) * rowH,
  }));
}

export function sanitizeLayouts(raw: unknown, viewportW = 1200, viewportH = 800): CanvasLayout[] {
  if (!Array.isArray(raw)) return [];
  const out: CanvasLayout[] = [];

  // Check if this is old grid format and needs migration
  if (isOldGridFormat(raw)) {
    return migrateFromGrid(raw as Record<string, unknown>[], viewportW, viewportH);
  }

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.i !== "string" || obj.i.length === 0) continue;
    const layout: CanvasLayout = enforceMinSize({
      i: obj.i,
      x: toFiniteNumber(obj.x, 0),
      y: toFiniteNumber(obj.y, 0),
      w: toFiniteNumber(obj.w, DEFAULT_W),
      h: toFiniteNumber(obj.h, DEFAULT_H),
    });
    out.push(layout);
  }
  return out;
}

export function sanitizeCanvasState(raw: unknown): CanvasState {
  const defaults: CanvasState = { zoom: 1, panX: 0, panY: 0, locked: false };
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Record<string, unknown>;
  return {
    zoom: Math.max(0.1, Math.min(2.0, toFiniteNumber(obj.zoom, 1))),
    panX: toFiniteNumber(obj.panX, 0),
    panY: toFiniteNumber(obj.panY, 0),
    locked: typeof obj.locked === "boolean" ? obj.locked : false,
  };
}

function computeAutoLayout(sessionIds: string[], viewportW = 1200, viewportH = 800): CanvasLayout[] {
  const n = sessionIds.length;
  if (n === 0) return [];
  const gap = 4;

  if (n === 1) {
    return [{ i: sessionIds[0], x: 0, y: 0, w: viewportW, h: viewportH }];
  }

  // Determine grid dimensions
  let cols: number, rows: number;
  if (n === 2) { cols = 2; rows = 1; }
  else if (n === 3) { cols = 2; rows = 2; }
  else if (n === 4) { cols = 2; rows = 2; }
  else if (n <= 6) { cols = 3; rows = 2; }
  else { cols = 3; rows = 3; }

  const cellW = (viewportW - gap * (cols - 1)) / cols;
  const cellH = (viewportH - gap * (rows - 1)) / rows;

  return sessionIds.map((id, idx) => {
    // Special case: 3 terminals - 2 on top, 1 full-width bottom
    if (n === 3 && idx === 2) {
      return enforceMinSize({
        i: id,
        x: 0,
        y: cellH + gap,
        w: viewportW,
        h: cellH,
      });
    }
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return enforceMinSize({
      i: id,
      x: col * (cellW + gap),
      y: row * (cellH + gap),
      w: cellW,
      h: cellH,
    });
  });
}

function generatePresetLayout(preset: PresetLayout, sessionIds: string[], viewportW = 1200, viewportH = 800): CanvasLayout[] {
  const gap = 4;
  switch (preset) {
    case "1x1":
      return sessionIds.slice(0, 1).map((id) => ({
        i: id, x: 0, y: 0, w: viewportW, h: viewportH,
      }));
    case "2x2": {
      const hw = (viewportW - gap) / 2;
      const hh = (viewportH - gap) / 2;
      return sessionIds.slice(0, 4).map((id, idx) => ({
        i: id,
        x: (idx % 2) * (hw + gap),
        y: Math.floor(idx / 2) * (hh + gap),
        w: hw,
        h: hh,
      }));
    }
    case "3x3": {
      const tw = (viewportW - gap * 2) / 3;
      const th = (viewportH - gap * 2) / 3;
      return sessionIds.slice(0, 9).map((id, idx) => ({
        i: id,
        x: (idx % 3) * (tw + gap),
        y: Math.floor(idx / 3) * (th + gap),
        w: tw,
        h: th,
      }));
    }
    case "1+2": {
      const mainW = viewportW * 2 / 3 - gap / 2;
      const sideW = viewportW / 3 - gap / 2;
      const sideH = (viewportH - gap) / 2;
      return sessionIds.slice(0, 3).map((id, idx) => {
        if (idx === 0) return { i: id, x: 0, y: 0, w: mainW, h: viewportH };
        return { i: id, x: mainW + gap, y: (idx - 1) * (sideH + gap), w: sideW, h: sideH };
      });
    }
    case "1+3": {
      const topH = viewportH * 2 / 3 - gap / 2;
      const botH = viewportH / 3 - gap / 2;
      const botW = (viewportW - gap * 2) / 3;
      return sessionIds.slice(0, 4).map((id, idx) => {
        if (idx === 0) return { i: id, x: 0, y: 0, w: viewportW, h: topH };
        return { i: id, x: (idx - 1) * (botW + gap), y: topH + gap, w: botW, h: botH };
      });
    }
    default:
      return [];
  }
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layouts: [],
  canvas: { zoom: 1, panX: 0, panY: 0, locked: false },
  maximizedPane: null,
  savedLayouts: [],
  minimizedPanes: {},

  setLayouts: (layouts) =>
    set({
      layouts: layouts.map(enforceMinSize),
      // setLayouts is used for workspace restore/switch; clear transient view state to prevent stale hidden panes.
      maximizedPane: null,
      savedLayouts: [],
      minimizedPanes: {},
    }),

  addPaneLayout: (sessionId) =>
    set((state) => {
      // Cascade from last visible pane
      const visible = state.layouts.filter((l) => !state.minimizedPanes[l.i]);
      const last = visible[visible.length - 1];
      const x = last ? last.x + CASCADE_OFFSET : 0;
      const y = last ? last.y + CASCADE_OFFSET : 0;
      const newLayout = enforceMinSize({ i: sessionId, x, y, w: DEFAULT_W, h: DEFAULT_H });
      const nextLayouts = [...state.layouts, newLayout];
      if (state.maximizedPane) {
        // New panes should always appear immediately instead of being hidden behind maximize mode.
        return {
          layouts: nextLayouts,
          maximizedPane: null,
          savedLayouts: [],
        };
      }
      return { layouts: nextLayouts };
    }),

  removePaneLayout: (sessionId) =>
    set((state) => {
      const newMinimized = { ...state.minimizedPanes };
      delete newMinimized[sessionId];
      return {
        layouts: state.layouts.filter((l) => l.i !== sessionId),
        maximizedPane: state.maximizedPane === sessionId ? null : state.maximizedPane,
        minimizedPanes: newMinimized,
      };
    }),

  applyPreset: (preset, sessionIds, viewportW = 1200, viewportH = 800) =>
    set({
      layouts: generatePresetLayout(preset, sessionIds, viewportW, viewportH),
      maximizedPane: null,
    }),

  toggleMaximize: (sessionId) =>
    set((state) => {
      if (state.maximizedPane === sessionId) {
        return {
          maximizedPane: null,
          layouts: state.savedLayouts.length > 0 ? state.savedLayouts : state.layouts,
          savedLayouts: [],
        };
      }
      return {
        maximizedPane: sessionId,
        savedLayouts: state.layouts,
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
      if (!existing || state.minimizedPanes[sessionId]) return state;
      return {
        minimizedPanes: {
          ...state.minimizedPanes,
          [sessionId]: { layout: { ...existing } },
        },
        layouts: state.layouts.filter((l) => l.i !== sessionId),
        maximizedPane: state.maximizedPane === sessionId ? null : state.maximizedPane,
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
        layouts: [...state.layouts, enforceMinSize(info.layout)],
      };
    }),

  isMinimized: (sessionId) => !!get().minimizedPanes[sessionId],

  autoLayout: (sessionIds, viewportW = 1200, viewportH = 800) =>
    set((state) => {
      const visibleIds = sessionIds.filter((id) => !state.minimizedPanes[id]);
      return {
        layouts: computeAutoLayout(visibleIds, viewportW, viewportH),
        maximizedPane: null,
      };
    }),

  // Canvas actions
  setZoom: (zoom) => set((state) => ({
    canvas: { ...state.canvas, zoom: Math.max(0.1, Math.min(2.0, zoom)) },
  })),

  setPan: (panX, panY) => set((state) => ({
    canvas: { ...state.canvas, panX, panY },
  })),

  toggleLocked: () => set((state) => ({
    canvas: { ...state.canvas, locked: !state.canvas.locked },
  })),

  setCanvas: (partial) => set((state) => ({
    canvas: { ...state.canvas, ...partial },
  })),

  zoomToFit: (viewportW, viewportH) =>
    set((state) => {
      const visible = state.layouts.filter((l) => !state.minimizedPanes[l.i]);
      if (visible.length === 0) return state;

      const minX = Math.min(...visible.map((l) => l.x));
      const minY = Math.min(...visible.map((l) => l.y));
      const maxX = Math.max(...visible.map((l) => l.x + l.w));
      const maxY = Math.max(...visible.map((l) => l.y + l.h));

      const contentW = maxX - minX;
      const contentH = maxY - minY;
      if (contentW === 0 || contentH === 0) return state;

      const padding = 40;
      const zoom = Math.max(0.1, Math.min(2.0,
        Math.min((viewportW - padding * 2) / contentW, (viewportH - padding * 2) / contentH)
      ));

      const panX = (viewportW / zoom - contentW) / 2 - minX;
      const panY = (viewportH / zoom - contentH) / 2 - minY;

      return { canvas: { ...state.canvas, zoom, panX, panY } };
    }),

  updatePaneLayout: (id, update) =>
    set((state) => ({
      layouts: state.layouts.map((l) =>
        l.i === id ? enforceMinSize({ ...l, ...update }) : l
      ),
    })),
}));
