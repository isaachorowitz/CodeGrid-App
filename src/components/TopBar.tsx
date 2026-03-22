import { memo, useCallback, useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSessionStore } from "../stores/sessionStore";
import { sanitizeLayouts, sanitizeCanvasState, useLayoutStore, type PresetLayout } from "../stores/layoutStore";
import { RunButton } from "./RunButton";
import { useToastStore } from "../stores/toastStore";
import { createWorkspace, renameWorkspace as renameWorkspaceIpc, setActiveWorkspace as setActiveWorkspaceIpc, renameSession as renameSessionIpc, deleteWorkspace as deleteWorkspaceIpc } from "../lib/ipc";
import { vibeLabel } from "../lib/vibeMode";

const STATUS_COLORS: Record<string, string> = {
  idle: "#4a9eff",
  running: "#00c853",
  waiting: "#ffab00",
  error: "#ff3d00",
  dead: "#555555",
};

interface TopBarProps {
  onFocusSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
}

export const TopBar = memo(function TopBar({ onFocusSession, onCloseSession }: TopBarProps) {
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    addWorkspace,
    removeWorkspace,
    setNewSessionDialogOpen,
    setCommandPaletteOpen,
    toggleSidebar,
    sidebarOpen,
    vibeMode,
  } = useWorkspaceStore();
  const sessions = useSessionStore((s) => s.sessions);
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId);
  const broadcastMode = useSessionStore((s) => s.broadcastMode);
  const toggleBroadcast = useSessionStore((s) => s.toggleBroadcast);
  const setSessionManualName = useSessionStore((s) => s.setSessionManualName);
  const applyPreset = useLayoutStore((s) => s.applyPreset);
  const autoLayout = useLayoutStore((s) => s.autoLayout);
  const canvasState = useLayoutStore((s) => s.canvas);
  const toggleLocked = useLayoutStore((s) => s.toggleLocked);
  const zoomToFit = useLayoutStore((s) => s.zoomToFit);
  const addToast = useToastStore((s) => s.addToast);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionName, setEditSessionName] = useState("");
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number;
    type: "workspace" | "session";
    id: string; currentName: string;
  } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) { if (e.key === "Escape") setCtxMenu(null); return; }
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [ctxMenu]);

  const openCtxMenu = useCallback((e: React.MouseEvent, type: "workspace" | "session", id: string, currentName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, type, id, currentName });
  }, []);

  const startRenameFromCtx = useCallback(() => {
    if (!ctxMenu) return;
    if (ctxMenu.type === "workspace") {
      setEditingId(ctxMenu.id);
      setEditName(ctxMenu.currentName);
    } else {
      setEditingSessionId(ctxMenu.id);
      setEditSessionName(ctxMenu.currentName);
    }
    setCtxMenu(null);
  }, [ctxMenu]);

  // Sessions for the active workspace, sorted by last-used (most recent first)
  const activeSessions = useMemo(
    () => sessions
      .filter((s) => s.workspace_id === activeWorkspaceId)
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)),
    [sessions, activeWorkspaceId],
  );

  const handleNewWorkspace = useCallback(async () => {
    const name = `Workspace ${workspaces.length + 1}`;
    try {
      const ws = await createWorkspace(name);
      addWorkspace(ws);
      await setActiveWorkspaceIpc(ws.id);
    } catch (e) {
      addToast(`Failed to create workspace: ${e}`, "error");
    }
  }, [workspaces.length, addWorkspace, addToast]);

  const setLayouts = useLayoutStore((s) => s.setLayouts);
  const setCanvas = useLayoutStore((s) => s.setCanvas);

  const handleSwitchWorkspace = useCallback(async (wsId: string) => {
    setActiveWorkspace(wsId);
    const defaultCanvas = sanitizeCanvasState(null);

    const targetWs = workspaces.find((w) => w.id === wsId);
    if (targetWs?.layout_json) {
      try {
        const parsed = JSON.parse(targetWs.layout_json);
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.layouts)) {
          setLayouts(sanitizeLayouts(parsed.layouts));
          setCanvas(parsed.canvas ? sanitizeCanvasState(parsed.canvas) : defaultCanvas);
        } else {
          setLayouts(sanitizeLayouts(parsed));
          setCanvas(defaultCanvas);
        }
      } catch {
        setLayouts([]);
        setCanvas(defaultCanvas);
      }
    } else {
      setLayouts([]);
      setCanvas(defaultCanvas);
    }

    try { await setActiveWorkspaceIpc(wsId); } catch (e) { console.warn("Failed to set active workspace:", e); }
  }, [setActiveWorkspace, workspaces, setLayouts, setCanvas]);

  const handlePreset = useCallback(
    (preset: PresetLayout) => {
      const ids = activeSessions.map((s) => s.id);
      // Use actual viewport size (subtract sidebar + topbar estimate)
      const vw = window.innerWidth - 60;
      const vh = window.innerHeight - 100;
      applyPreset(preset, ids, vw, vh);
      // Reset zoom/pan so panes are visible
      setCanvas({ zoom: 1, panX: 0, panY: 0 });
    },
    [activeSessions, applyPreset, setCanvas],
  );

  const handleAutoLayout = useCallback(() => {
    const ids = activeSessions.map((s) => s.id);
    const vw = window.innerWidth - 60;
    const vh = window.innerHeight - 100;
    autoLayout(ids, vw, vh);
    // Reset zoom/pan so panes are visible
    setCanvas({ zoom: 1, panX: 0, panY: 0 });
  }, [activeSessions, autoLayout, setCanvas]);

  const handleRenameEnd = useCallback(
    async (id: string) => {
      if (editName.trim()) {
        try {
          await renameWorkspaceIpc(id, editName.trim());
          useWorkspaceStore.getState().updateWorkspace(id, { name: editName.trim() });
        } catch (e) {
          addToast(`Failed to rename workspace: ${e}`, "error");
        }
      }
      setEditingId(null);
    },
    [editName, addToast],
  );

  const handleSessionRenameEnd = useCallback(
    (sessionId: string) => {
      const trimmed = editSessionName.trim();
      if (trimmed) {
        setSessionManualName(sessionId, trimmed);
        // Persist to DB so the name survives app restarts
        renameSessionIpc(sessionId, trimmed).catch((e) =>
          console.warn("Failed to persist session name:", e)
        );
      }
      setEditingSessionId(null);
    },
    [editSessionName, setSessionManualName],
  );

  const handleDeleteWorkspace = useCallback(async (wsId: string) => {
    if (confirmDeleteId !== wsId) {
      setConfirmDeleteId(wsId);
      setCtxMenu(null);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await deleteWorkspaceIpc(wsId);
      removeWorkspace(wsId);
    } catch (e) {
      addToast(`Failed to delete workspace: ${e}`, "error");
    }
  }, [confirmDeleteId, removeWorkspace, addToast]);

  const presets: { label: string; value: PresetLayout }[] = [
    { label: "1", value: "1x1" },
    { label: "4", value: "2x2" },
    { label: "9", value: "3x3" },
    { label: "1+2", value: "1+2" },
    { label: "1+3", value: "1+3" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "rgba(18, 18, 18, 0.9)",
        border: "1px solid #2a2a2a",
        borderRadius: "12px",
        boxShadow: "0 10px 28px rgba(0, 0, 0, 0.35)",
        backdropFilter: "blur(6px)",
        userSelect: "none",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Main bar */}
      <div
        style={{
          height: "32px",
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          gap: "4px",
        }}
      >
        {/* Toggle sidebar */}
        <button
          onClick={() => toggleSidebar()}
          title="Toggle Sidebar (Cmd+S)"
          style={{
            background: "none", border: "none",
            color: sidebarOpen ? "#ff8c00" : "#555555",
            fontSize: "14px", cursor: "pointer", padding: "4px 6px",
            fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ff8c00")}
          onMouseLeave={(e) => (e.currentTarget.style.color = sidebarOpen ? "#ff8c00" : "#555555")}
        >
          {sidebarOpen ? "\u00AB" : "\u00BB"}
        </button>

        {/* Logo */}
        <div
          style={{
            fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
            fontSize: "12px",
            fontWeight: "bold",
            color: "#ff8c00",
            marginRight: "8px",
            letterSpacing: "1px",
          }}
        >
          CODEGRID
        </div>

        {/* Vibe Mode badge */}
        {vibeMode && (
          <div
            style={{
              background: "linear-gradient(135deg, #ff8c00, #ff6600)",
              color: "#0a0a0a",
              fontSize: "9px",
              fontWeight: "bold",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              padding: "1px 6px",
              letterSpacing: "1px",
              marginRight: "4px",
            }}
            title="Vibe Mode is active — simplified interface for AI-assisted coding"
          >
            VIBE
          </div>
        )}

        {/* Workspace tabs */}
        <div style={{ display: "flex", gap: "1px", flex: 1, overflow: "hidden" }}>
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              onClick={() => handleSwitchWorkspace(ws.id)}
              onDoubleClick={() => { setEditingId(ws.id); setEditName(ws.name); }}
              onContextMenu={(e) => openCtxMenu(e, "workspace", ws.id, ws.name)}
              title={ws.repo_path ? ws.repo_path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~") : ws.name}
              style={{
                padding: "4px 12px",
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                color: ws.id === activeWorkspaceId ? "#ff8c00" : "#888888",
                background: ws.id === activeWorkspaceId ? "#1e1e1e" : "transparent",
                borderBottom: ws.id === activeWorkspaceId ? "2px solid #ff8c00" : "2px solid transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {ws.repo_path && (
                <span style={{ color: ws.id === activeWorkspaceId ? "#d500f9" : "#555555", fontSize: "9px" }}>
                  {ws.repo_path ? "R" : ""}
                </span>
              )}
              {editingId === ws.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleRenameEnd(ws.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameEnd(ws.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  style={{
                    background: "transparent", border: "none", color: "#ff8c00",
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", fontSize: "11px", outline: "none",
                    width: "80px", padding: 0,
                  }}
                />
              ) : (
                ws.name
              )}
            </div>
          ))}
          <button
            onClick={handleNewWorkspace}
            title="New Workspace (Cmd+Shift+N)"
            style={{
              background: "none", border: "none", color: "#555555", fontSize: "14px",
              cursor: "pointer", padding: "4px 8px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ff8c00")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
          >
            +
          </button>
        </div>

        {/* Layout presets */}
        <div style={{ display: "flex", gap: "1px", marginRight: "4px" }}>
          {presets.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePreset(p.value)}
              title={`Layout: ${p.value}`}
              style={{
                background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888888",
                fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
                padding: "2px 5px", minWidth: "22px", textAlign: "center",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#ff8c00"; e.currentTarget.style.borderColor = "#ff8c00"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#888888"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Auto Layout button */}
        <button
          onClick={handleAutoLayout}
          title="Auto Layout: automatically arrange all visible terminals in a clean grid"
          style={{
            background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888888",
            fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
            padding: "2px 6px", marginRight: "2px", letterSpacing: "0.5px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ff8c00"; e.currentTarget.style.borderColor = "#ff8c00"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#888888"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
        >
          AUTO
        </button>

        {/* Lock toggle */}
        <button
          onClick={toggleLocked}
          title={canvasState.locked ? "Unlock canvas (allow drag/resize)" : "Lock canvas (prevent drag/resize)"}
          style={{
            background: canvasState.locked ? "rgba(255, 140, 0, 0.2)" : "#1e1e1e",
            border: `1px solid ${canvasState.locked ? "#ff8c00" : "#2a2a2a"}`,
            color: canvasState.locked ? "#ff8c00" : "#555555",
            fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
            padding: "2px 6px", marginRight: "2px",
          }}
        >
          {canvasState.locked ? "LOCKED" : "UNLCK"}
        </button>

        {/* Zoom indicator */}
        <div
          style={{
            background: "#1e1e1e",
            border: "1px solid #2a2a2a",
            color: "#666666",
            fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
            padding: "2px 5px", marginRight: "2px",
            minWidth: "30px", textAlign: "center",
          }}
        >
          {Math.round(canvasState.zoom * 100)}%
        </div>

        {/* Fit All */}
        <button
          onClick={() => zoomToFit(window.innerWidth, window.innerHeight - 100)}
          title="Zoom to fit all panes"
          style={{
            background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888888",
            fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
            padding: "2px 6px", marginRight: "2px", letterSpacing: "0.5px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ff8c00"; e.currentTarget.style.borderColor = "#ff8c00"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#888888"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
        >
          FIT
        </button>

        {/* Quick new session in current project */}
        <button
          onClick={() => {
            const ws = workspaces.find((w) => w.id === activeWorkspaceId);
            const dir = ws?.repo_path ?? activeSessions[0]?.working_dir ?? "";
            if (dir) {
              window.dispatchEvent(new CustomEvent("codegrid:quick-session", { detail: { path: dir, type: "claude" } }));
            } else {
              setNewSessionDialogOpen(true);
            }
          }}
          title={vibeMode ? "New Chat in this project (Cmd+N)" : "New Session in this project (Cmd+N)"}
          style={{
            background: "#ff8c00", border: "1px solid #ff8c00", color: "#0a0a0a",
            fontSize: "10px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
            padding: "2px 8px", fontWeight: "bold",
          }}
        >
          + NEW
        </button>

        {/* Open new session dialog (choose project/type) */}
        <button
          onClick={() => setNewSessionDialogOpen(true)}
          title="New session (choose project)"
          style={{
            background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888",
            fontSize: "10px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
            padding: "2px 6px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ff8c00"; e.currentTarget.style.borderColor = "#ff8c00"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#888"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
        >
          + ...
        </button>

        {/* Command palette */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          title="Command Palette (Cmd+K)"
          style={{
            background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#555555",
            fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
            padding: "2px 6px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ff8c00"; e.currentTarget.style.borderColor = "#ff8c00"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#555555"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
        >
          CMD+K
        </button>
      </div>

      {/* Session tab bar */}
      {activeSessions.length > 0 && (
        <div
          style={{
            height: "26px",
            display: "flex",
            alignItems: "center",
            padding: "0 8px",
            gap: "1px",
            borderTop: "1px solid #1e1e1e",
            background: "#0f0f0f",
            overflow: "hidden",
          }}
        >
          {activeSessions.map((session) => {
            const isFocused = session.id === focusedSessionId;
            const isHovered = session.id === hoveredTab;
            const statusColor = STATUS_COLORS[session.status] ?? "#555555";

            // Display name: manual name > activity name > fallback to working dir
            const displayName = session.manualName
              ?? session.activityName
              ?? (session.working_dir.split("/").pop() || session.working_dir);

            return (
              <div
                key={session.id}
                onClick={() => {
                  onFocusSession(session.id);
                  window.dispatchEvent(
                    new CustomEvent("codegrid:zoom-to-session", {
                      detail: { sessionId: session.id },
                    }),
                  );
                }}
                onDoubleClick={() => { setEditingSessionId(session.id); setEditSessionName(displayName); }}
                onContextMenu={(e) => openCtxMenu(e, "session", session.id, displayName)}
                onMouseEnter={() => setHoveredTab(session.id)}
                onMouseLeave={() => setHoveredTab(null)}
                title={`Right-click or double-click to rename. Dir: ${session.working_dir}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  cursor: "pointer",
                  background: isFocused ? "#1e1e1e" : isHovered ? "#1a1a1a" : "transparent",
                  borderBottom: isFocused ? "2px solid #ff8c00" : "2px solid transparent",
                  borderTop: "2px solid transparent",
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                  fontSize: "10px",
                  whiteSpace: "nowrap",
                  maxWidth: "200px",
                  position: "relative",
                }}
              >
                {/* Status dot */}
                <div style={{
                  width: "5px", height: "5px", borderRadius: "50%",
                  background: statusColor, flexShrink: 0,
                }} />

                {/* Pane number */}
                <span style={{ color: "#ff8c00", fontWeight: "bold", fontSize: "9px" }}>
                  [{session.pane_number}]
                </span>

                {/* Display name -- editable on double-click */}
                {editingSessionId === session.id ? (
                  <input
                    value={editSessionName}
                    onChange={(e) => setEditSessionName(e.target.value)}
                    onBlur={() => handleSessionRenameEnd(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSessionRenameEnd(session.id);
                      if (e.key === "Escape") setEditingSessionId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    style={{
                      background: "transparent", border: "none", color: "#e0e0e0",
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                      fontSize: "10px", outline: "none", width: "80px", padding: 0,
                    }}
                  />
                ) : (
                  <span style={{
                    color: isFocused ? "#e0e0e0" : "#888888",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontSize: "10px",
                  }}>
                    {displayName}
                  </span>
                )}

                {/* Close button */}
                <button
                  onClick={(e) => { e.stopPropagation(); onCloseSession(session.id); }}
                  aria-label={`Close session ${session.pane_number}`}
                  style={{
                    background: "none", border: "none",
                    color: "#333333", cursor: "pointer",
                    fontSize: "10px", padding: "0 1px",
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                    lineHeight: 1,
                    visibility: isHovered || isFocused ? "visible" : "hidden",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ff3d00")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#333333")}
                >
                  x
                </button>
              </div>
            );
          })}

          {/* Quick add terminal button */}
          <button
            onClick={() => {
              const ws = workspaces.find((w) => w.id === activeWorkspaceId);
              const dir = ws?.repo_path ?? activeSessions[0]?.working_dir ?? "";
              if (dir) {
                window.dispatchEvent(new CustomEvent("codegrid:quick-session", { detail: { path: dir, type: "shell" } }));
              } else {
                setNewSessionDialogOpen(true);
              }
            }}
            title="Quick add terminal in workspace directory"
            style={{
              background: "none", border: "none", color: "#333333",
              fontSize: "12px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              cursor: "pointer", padding: "2px 6px", flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ff8c00")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#333333")}
          >
            +
          </button>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Run button */}
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <RunButton />
          </div>
        </div>
      )}

      {/* Context menu — portaled to body to escape overflow:hidden */}
      {ctxMenu && createPortal(
        <div
          ref={ctxRef}
          style={{
            position: "fixed",
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 9999,
            background: "#1e1e1e",
            border: "1px solid #2a2a2a",
            boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
            fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
            minWidth: "160px",
            padding: "4px 0",
          }}
        >
          <div style={{ padding: "4px 12px", fontSize: "9px", color: "#555555", letterSpacing: "1px", borderBottom: "1px solid #2a2a2a", marginBottom: "2px" }}>
            {ctxMenu.type === "workspace" ? "WORKSPACE" : "TERMINAL"}
          </div>
          <button
            onClick={startRenameFromCtx}
            style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: "#e0e0e0", fontSize: "11px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "6px 14px", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#ff8c0020"; e.currentTarget.style.color = "#ff8c00"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#e0e0e0"; }}
          >
            ✎ Rename
          </button>
          {ctxMenu.type === "workspace" && (
            <>
              <div style={{ height: "1px", background: "#2a2a2a", margin: "2px 0" }} />
              <button
                onClick={() => handleDeleteWorkspace(ctxMenu.id)}
                style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: "#ff3d00", fontSize: "11px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "6px 14px", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#ff3d0020"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                ✕ Delete Workspace
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {/* Delete confirmation overlay — portaled to body */}
      {confirmDeleteId && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#1a1a1a", border: "1px solid #ff3d00", padding: "24px 28px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", minWidth: "320px" }}
          >
            <div style={{ color: "#ff3d00", fontWeight: "bold", fontSize: "12px", letterSpacing: "1px", marginBottom: "8px" }}>DELETE WORKSPACE</div>
            <div style={{ color: "#888888", fontSize: "11px", marginBottom: "20px", lineHeight: "1.6" }}>
              This will close all terminals in "{workspaces.find((w) => w.id === confirmDeleteId)?.name ?? "this workspace"}" and remove it permanently.
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => handleDeleteWorkspace(confirmDeleteId)}
                style={{ flex: 1, background: "#ff3d00", border: "none", color: "#fff", fontSize: "11px", fontWeight: "bold", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "8px", cursor: "pointer" }}
              >
                DELETE
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{ flex: 1, background: "transparent", border: "1px solid #333333", color: "#888888", fontSize: "11px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "8px", cursor: "pointer" }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});
