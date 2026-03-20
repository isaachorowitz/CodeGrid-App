import { useCallback, useMemo, memo, useRef, useEffect } from "react";
import { Pane } from "./Pane";
import { MinimizedPaneBar } from "./MinimizedPaneBar";
import { useSessionStore } from "../stores/sessionStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { CanvasLayout } from "../stores/layoutStore";

interface CanvasProps {
  width: number;
  height: number;
  onCloseSession: (sessionId: string) => void;
}

const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";

// ── Perf-critical: all pan/drag/resize runs via refs + direct DOM mutation.
//    Zustand is only written on mouseup (commit), so React never re-renders mid-gesture.

export const Canvas = memo(function Canvas({ width, height, onCloseSession }: CanvasProps) {
  const allSessions = useSessionStore((s) => s.sessions);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const sessions = useMemo(
    () => allSessions.filter((s) => s.workspace_id === activeWorkspaceId),
    [allSessions, activeWorkspaceId],
  );
  const layouts = useLayoutStore((s) => s.layouts);
  const maximizedPane = useLayoutStore((s) => s.maximizedPane);
  const minimizedPanes = useLayoutStore((s) => s.minimizedPanes);
  const canvas = useLayoutStore((s) => s.canvas);
  const toggleLocked = useLayoutStore((s) => s.toggleLocked);
  const zoomToFit = useLayoutStore((s) => s.zoomToFit);
  const autoLayout = useLayoutStore((s) => s.autoLayout);
  const setCanvas = useLayoutStore((s) => s.setCanvas);

  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLSpanElement>(null);

  // Live mutable state — never triggers renders
  const live = useRef({
    zoom: canvas.zoom,
    panX: canvas.panX,
    panY: canvas.panY,
    locked: canvas.locked,
    // interaction
    mode: "idle" as "idle" | "pan" | "drag" | "resize",
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
    // drag
    dragId: "",
    dragOrigX: 0,
    dragOrigY: 0,
    dragEl: null as HTMLElement | null,
    // resize
    resizeId: "",
    resizeHandle: "",
    resizeOrigX: 0,
    resizeOrigY: 0,
    resizeOrigW: 0,
    resizeOrigH: 0,
    resizeEl: null as HTMLElement | null,
    // space
    spaceHeld: false,
  });

  // Sync zustand → live ref when store changes (e.g. preset, autoLayout, external)
  useEffect(() => {
    live.current.zoom = canvas.zoom;
    live.current.panX = canvas.panX;
    live.current.panY = canvas.panY;
    live.current.locked = canvas.locked;
    applySurfaceTransform();
    applyBgTransform();
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(canvas.zoom * 100)}%`;
  }, [canvas.zoom, canvas.panX, canvas.panY, canvas.locked]);

  // Reserve space for minimized pane bar
  const hasMinimized = Object.keys(minimizedPanes).length > 0;
  const minimizedBarHeight = hasMinimized ? 34 : 0;
  const canvasHeight = height - minimizedBarHeight;

  const minimizedSessions = useMemo(() => {
    const minIds = new Set(Object.keys(minimizedPanes));
    return sessions.filter((s) => minIds.has(s.id));
  }, [sessions, minimizedPanes]);

  const visibleLayouts = useMemo(() => {
    if (maximizedPane) return layouts.filter((l) => l.i === maximizedPane);
    return layouts;
  }, [layouts, maximizedPane]);

  const visibleSessions = useMemo(() => {
    const layoutIds = new Set(visibleLayouts.map((l) => l.i));
    return sessions.filter((s) => layoutIds.has(s.id));
  }, [sessions, visibleLayouts]);

  // ── Direct DOM helpers (no React) ──

  function applySurfaceTransform() {
    const el = surfaceRef.current;
    if (!el) return;
    const { zoom, panX, panY } = live.current;
    el.style.transform = `scale(${zoom}) translate(${panX}px, ${panY}px)`;
  }

  function applyBgTransform() {
    const el = bgRef.current;
    if (!el) return;
    const { zoom, panX, panY } = live.current;
    const size = 24 * zoom;
    el.style.backgroundSize = `${size}px ${size}px`;
    el.style.backgroundPosition = `${(panX * zoom) % size}px ${(panY * zoom) % size}px`;
  }

  function updateZoomLabel() {
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(live.current.zoom * 100)}%`;
    }
  }

  /** Commit current live state to zustand (triggers one render) */
  function commitCanvasState() {
    const { zoom, panX, panY } = live.current;
    const store = useLayoutStore.getState();
    // Batch into one set call
    useLayoutStore.setState({
      canvas: { ...store.canvas, zoom, panX, panY },
    });
  }

  function commitPaneLayout(id: string, x: number, y: number, w: number, h: number) {
    useLayoutStore.getState().updatePaneLayout(id, { x, y, w, h });
  }

  // ── Wheel zoom (native event for passive:false) ──
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const handler = (e: WheelEvent) => {
      if (maximizedPane) return;
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const L = live.current;
      const oldZoom = L.zoom;
      const delta = -e.deltaY * 0.001;
      const newZoom = Math.max(0.1, Math.min(2.0, oldZoom + delta));

      const worldX = mouseX / oldZoom - L.panX;
      const worldY = mouseY / oldZoom - L.panY;

      L.zoom = newZoom;
      L.panX = mouseX / newZoom - worldX;
      L.panY = mouseY / newZoom - worldY;

      applySurfaceTransform();
      applyBgTransform();
      updateZoomLabel();
    };
    vp.addEventListener("wheel", handler, { passive: false });
    return () => vp.removeEventListener("wheel", handler);
  }, [maximizedPane]);

  // Commit zoom on debounced idle (so zustand updates after scrolling stops)
  const wheelCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const handler = () => {
      if (wheelCommitTimer.current) clearTimeout(wheelCommitTimer.current);
      wheelCommitTimer.current = setTimeout(commitCanvasState, 150);
    };
    vp.addEventListener("wheel", handler, { passive: true });
    return () => { vp.removeEventListener("wheel", handler); if (wheelCommitTimer.current) clearTimeout(wheelCommitTimer.current); };
  }, []);

  // ── Spacebar ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        live.current.spaceHeld = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        live.current.spaceHeld = false;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // ── Global mousemove / mouseup (native, on window for capture outside viewport) ──
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const L = live.current;
      if (L.mode === "idle") return;

      if (L.mode === "pan") {
        const dx = (e.clientX - L.startX) / L.zoom;
        const dy = (e.clientY - L.startY) / L.zoom;
        L.panX = L.origPanX + dx;
        L.panY = L.origPanY + dy;
        applySurfaceTransform();
        applyBgTransform();
        return;
      }

      if (L.mode === "drag" && L.dragEl) {
        const dx = (e.clientX - L.startX) / L.zoom;
        const dy = (e.clientY - L.startY) / L.zoom;
        const nx = L.dragOrigX + dx;
        const ny = L.dragOrigY + dy;
        L.dragEl.style.left = `${nx}px`;
        L.dragEl.style.top = `${ny}px`;
        return;
      }

      if (L.mode === "resize" && L.resizeEl) {
        const dx = (e.clientX - L.startX) / L.zoom;
        const dy = (e.clientY - L.startY) / L.zoom;
        let { resizeOrigX: x, resizeOrigY: y, resizeOrigW: w, resizeOrigH: h } = L;
        const handle = L.resizeHandle;
        if (handle.includes("e")) w = Math.max(200, w + dx);
        if (handle.includes("s")) h = Math.max(150, h + dy);
        if (handle.includes("w")) { const nw = Math.max(200, w - dx); x = x + (w - nw); w = nw; }
        if (handle.includes("n")) { const nh = Math.max(150, h - dy); y = y + (h - nh); h = nh; }
        L.resizeEl.style.left = `${x}px`;
        L.resizeEl.style.top = `${y}px`;
        L.resizeEl.style.width = `${w}px`;
        L.resizeEl.style.height = `${h}px`;
        return;
      }
    };

    const onUp = () => {
      const L = live.current;
      if (L.mode === "pan") {
        commitCanvasState();
      } else if (L.mode === "drag" && L.dragEl) {
        const x = parseFloat(L.dragEl.style.left);
        const y = parseFloat(L.dragEl.style.top);
        // Use current layout w/h (drag doesn't change size)
        const layout = useLayoutStore.getState().layouts.find((l) => l.i === L.dragId);
        if (layout) commitPaneLayout(L.dragId, x, y, layout.w, layout.h);
      } else if (L.mode === "resize" && L.resizeEl) {
        const x = parseFloat(L.resizeEl.style.left);
        const y = parseFloat(L.resizeEl.style.top);
        const w = parseFloat(L.resizeEl.style.width);
        const h = parseFloat(L.resizeEl.style.height);
        commitPaneLayout(L.resizeId, x, y, w, h);
      }
      L.mode = "idle";
      L.dragEl = null;
      L.resizeEl = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // ── Canvas mousedown → pan ──
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (maximizedPane) return;
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    const L = live.current;
    L.mode = "pan";
    L.startX = e.clientX;
    L.startY = e.clientY;
    L.origPanX = L.panX;
    L.origPanY = L.panY;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  }, [maximizedPane]);

  // ── Pane drag start ──
  const handlePaneDragStart = useCallback((id: string, e: React.MouseEvent) => {
    const L = live.current;
    if (L.locked || maximizedPane) return;
    e.preventDefault();
    e.stopPropagation();
    const layout = useLayoutStore.getState().layouts.find((l) => l.i === id);
    if (!layout) return;
    // Find the pane wrapper element by data attribute
    const el = document.querySelector(`[data-pane-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    L.mode = "drag";
    L.startX = e.clientX;
    L.startY = e.clientY;
    L.dragId = id;
    L.dragOrigX = layout.x;
    L.dragOrigY = layout.y;
    L.dragEl = el;
    document.body.style.cursor = "move";
    document.body.style.userSelect = "none";
  }, [maximizedPane]);

  // ── Resize start ──
  const handleResizeStart = useCallback((id: string, handle: string, e: React.MouseEvent) => {
    const L = live.current;
    if (L.locked || maximizedPane) return;
    e.preventDefault();
    e.stopPropagation();
    const layout = useLayoutStore.getState().layouts.find((l) => l.i === id);
    if (!layout) return;
    const el = document.querySelector(`[data-pane-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    L.mode = "resize";
    L.startX = e.clientX;
    L.startY = e.clientY;
    L.resizeId = id;
    L.resizeHandle = handle;
    L.resizeOrigX = layout.x;
    L.resizeOrigY = layout.y;
    L.resizeOrigW = layout.w;
    L.resizeOrigH = layout.h;
    L.resizeEl = el;
    document.body.style.userSelect = "none";
  }, [maximizedPane]);

  const handleAutoGrid = useCallback(() => {
    const ids = visibleSessions.map((s) => s.id);
    autoLayout(ids, width, canvasHeight);
    // Reset zoom/pan to origin
    setCanvas({ zoom: 1, panX: 0, panY: 0 });
    live.current.zoom = 1;
    live.current.panX = 0;
    live.current.panY = 0;
    applySurfaceTransform();
    applyBgTransform();
    updateZoomLabel();
  }, [visibleSessions, width, canvasHeight, autoLayout, setCanvas]);

  const handleFitAll = useCallback(() => {
    zoomToFit(width, canvasHeight);
    // Sync live ref from store after zoomToFit updates it
    requestAnimationFrame(() => {
      const c = useLayoutStore.getState().canvas;
      live.current.zoom = c.zoom;
      live.current.panX = c.panX;
      live.current.panY = c.panY;
      applySurfaceTransform();
      applyBgTransform();
      updateZoomLabel();
    });
  }, [width, canvasHeight, zoomToFit]);

  const zoomPercent = Math.round(canvas.zoom * 100);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Canvas viewport */}
      <div
        ref={viewportRef}
        onMouseDown={handleCanvasMouseDown}
        style={{
          position: "relative",
          width: "100%",
          height: canvasHeight,
          overflow: "hidden",
          cursor: "grab",
        }}
      >
        {/* Dot grid background */}
        <div
          ref={bgRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            backgroundImage: "radial-gradient(circle, #222222 1px, transparent 1px)",
            backgroundSize: `${24 * canvas.zoom}px ${24 * canvas.zoom}px`,
            backgroundPosition: `${(canvas.panX * canvas.zoom) % (24 * canvas.zoom)}px ${(canvas.panY * canvas.zoom) % (24 * canvas.zoom)}px`,
            willChange: "background-size, background-position",
          }}
        />

        {/* Canvas surface */}
        <div
          ref={surfaceRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transformOrigin: "0 0",
            transform: maximizedPane
              ? "none"
              : `scale(${canvas.zoom}) translate(${canvas.panX}px, ${canvas.panY}px)`,
            willChange: "transform",
            zIndex: 1,
          }}
        >
          {visibleSessions.map((session) => {
            const layout = visibleLayouts.find((l) => l.i === session.id);
            if (!layout) return null;

            const isMaximized = maximizedPane === session.id;
            const paneStyle: React.CSSProperties = isMaximized
              ? { position: "absolute", left: 0, top: 0, width, height: canvasHeight, zIndex: 10 }
              : { position: "absolute", left: layout.x, top: layout.y, width: layout.w, height: layout.h };

            return (
              <div
                key={session.id}
                data-pane-id={session.id}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ ...paneStyle, overflow: "hidden", willChange: "left, top, width, height" }}
              >
                {/* Zoomed-out label overlay */}
                {canvas.zoom < 0.5 && !maximizedPane && (
                  <ZoomedOutLabel session={session} zoom={canvas.zoom} />
                )}

                <Pane
                  session={session}
                  onClose={onCloseSession}
                  onDragStart={(e) => handlePaneDragStart(session.id, e)}
                />

                {/* Resize handles */}
                {!canvas.locked && !maximizedPane && (
                  <ResizeHandles sessionId={session.id} onResizeStart={handleResizeStart} />
                )}
              </div>
            );
          })}
        </div>

        {/* Canvas controls overlay */}
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            display: "flex",
            gap: "2px",
            zIndex: 100,
            fontFamily: MONO,
            fontSize: "10px",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Auto-grid: reset all panes to a clean tiled layout */}
          <button
            onClick={handleAutoGrid}
            title="Auto-grid: tile all panes neatly and reset zoom/pan"
            style={{
              background: "#ff8c00",
              border: "1px solid #ff8c00",
              color: "#0a0a0a",
              padding: "3px 8px",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: "10px",
              fontWeight: "bold",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#ffa040"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#ff8c00"; }}
          >
            AUTO
          </button>
          <button
            onClick={handleFitAll}
            title="Zoom to fit all panes into view"
            style={{
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              color: "#555555",
              padding: "3px 6px",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: "10px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#ff8c00"; e.currentTarget.style.borderColor = "#ff8c00"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#555555"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
          >
            FIT
          </button>
          <button
            onClick={() => toggleLocked()}
            title={canvas.locked ? "Unlock canvas" : "Lock canvas"}
            style={{
              background: canvas.locked ? "rgba(255, 140, 0, 0.2)" : "#1a1a1a",
              border: `1px solid ${canvas.locked ? "#ff8c00" : "#2a2a2a"}`,
              color: canvas.locked ? "#ff8c00" : "#555555",
              padding: "3px 6px",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: "10px",
            }}
          >
            {canvas.locked ? "LOCKED" : "UNLCK"}
          </button>
          <span
            ref={zoomLabelRef}
            style={{
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              color: "#666666",
              padding: "3px 6px",
              fontFamily: MONO,
              fontSize: "10px",
              minWidth: "36px",
              textAlign: "center",
              display: "inline-block",
            }}
          >
            {zoomPercent}%
          </span>
        </div>
      </div>

      {/* Minimized panes dock */}
      {minimizedSessions.length > 0 && (
        <MinimizedPaneBar sessions={minimizedSessions} onCloseSession={onCloseSession} />
      )}
    </div>
  );
});

// ── Extracted pure components to avoid re-renders ──

const RESIZE_HANDLES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

const ResizeHandles = memo(function ResizeHandles({
  sessionId,
  onResizeStart,
}: {
  sessionId: string;
  onResizeStart: (id: string, handle: string, e: React.MouseEvent) => void;
}) {
  return (
    <>
      {RESIZE_HANDLES.map((handle) => (
        <div
          key={handle}
          onMouseDown={(e) => onResizeStart(sessionId, handle, e)}
          style={{
            position: "absolute",
            ...getResizeHandleStyle(handle),
            zIndex: 15,
          }}
        />
      ))}
    </>
  );
});

const STATUS_COLORS: Record<string, string> = {
  idle: "#4a9eff", running: "#00c853", waiting: "#ffab00",
  error: "#ff3d00", dead: "#555555",
};

const ZoomedOutLabel = memo(function ZoomedOutLabel({
  session,
  zoom,
}: {
  session: { pane_number: number; manualName?: string | null; activityName?: string | null; working_dir: string; status?: string | null };
  zoom: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10, 10, 10, 0.85)",
        zIndex: 20,
        pointerEvents: "none",
        flexDirection: "column",
        gap: `${4 / zoom}px`,
      }}
    >
      <span style={{
        fontSize: `${Math.min(48, 16 / zoom)}px`,
        fontWeight: "bold",
        color: "#ff8c00",
        fontFamily: MONO,
      }}>
        {session.pane_number}
      </span>
      <span style={{
        fontSize: `${Math.min(24, 10 / zoom)}px`,
        color: "#888888",
        fontFamily: MONO,
        textAlign: "center",
        maxWidth: "90%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {session.manualName ?? session.activityName ?? session.working_dir.split("/").pop()}
      </span>
      <div style={{
        width: `${Math.min(16, 6 / zoom)}px`,
        height: `${Math.min(16, 6 / zoom)}px`,
        borderRadius: "50%",
        background: STATUS_COLORS[session.status ?? "idle"] ?? "#4a9eff",
      }} />
    </div>
  );
});

function getResizeHandleStyle(handle: string): React.CSSProperties {
  const size = 6;
  const edge = 2;

  switch (handle) {
    case "n": return { top: 0, left: size, right: size, height: edge, cursor: "ns-resize" };
    case "s": return { bottom: 0, left: size, right: size, height: edge, cursor: "ns-resize" };
    case "e": return { right: 0, top: size, bottom: size, width: edge, cursor: "ew-resize" };
    case "w": return { left: 0, top: size, bottom: size, width: edge, cursor: "ew-resize" };
    case "ne": return { top: 0, right: 0, width: size, height: size, cursor: "nesw-resize" };
    case "nw": return { top: 0, left: 0, width: size, height: size, cursor: "nwse-resize" };
    case "se": return { bottom: 0, right: 0, width: size, height: size, cursor: "nwse-resize" };
    case "sw": return { bottom: 0, left: 0, width: size, height: size, cursor: "nesw-resize" };
    default: return {};
  }
}
