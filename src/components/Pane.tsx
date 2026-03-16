import { memo, useCallback, useState, useRef, useEffect } from "react";
import { TerminalView } from "./Terminal";
import { StatusBar } from "./StatusBar";
import { useSessionStore } from "../stores/sessionStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useLayoutStore } from "../stores/layoutStore";
import type { SessionWithModel } from "../stores/sessionStore";
import { vibeLabel } from "../lib/vibeMode";

interface PaneProps {
  session: SessionWithModel;
  onClose: (sessionId: string) => void;
}

export const Pane = memo(function Pane({ session, onClose }: PaneProps) {
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId);
  const broadcastMode = useSessionStore((s) => s.broadcastMode);
  const setFocusedSession = useSessionStore((s) => s.setFocusedSession);
  const setSessionManualName = useSessionStore((s) => s.setSessionManualName);
  const toggleMaximize = useLayoutStore((s) => s.toggleMaximize);
  const minimizePane = useLayoutStore((s) => s.minimizePane);
  const maximizedPane = useLayoutStore((s) => s.maximizedPane);
  const vibeMode = useWorkspaceStore((s) => s.vibeMode);
  const isFocused = focusedSessionId === session.id;
  const isMaximized = maximizedPane === session.id;

  // Display name: manual name > activity name > fallback
  const rawName = session.manualName
    ?? session.activityName
    ?? (session.command?.includes("claude") ? "claude" : "shell");
  const displayName = vibeMode
    ? (rawName === "claude" ? "AI" : rawName === "shell" ? "terminal" : rawName)
    : rawName;

  const handleFocus = useCallback(() => {
    setFocusedSession(session.id);
  }, [session.id, setFocusedSession]);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose(session.id);
    },
    [session.id, onClose],
  );

  const handleMinimize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      minimizePane(session.id);
    },
    [session.id, minimizePane],
  );

  const handleDoubleClick = useCallback(() => {
    toggleMaximize(session.id);
  }, [session.id, toggleMaximize]);

  // Right-click context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) { if (e.key === "Escape") setCtxMenu(null); return; }
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [ctxMenu]);

  const startRename = useCallback(() => {
    setCtxMenu(null);
    setRenameValue(displayName);
    setRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 20);
  }, [displayName]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      setSessionManualName(session.id, trimmed);
      import("../lib/ipc").then(({ renameSession }) => renameSession(session.id, trimmed).catch(() => {}));
    }
    setRenaming(false);
  }, [renameValue, session.id, setSessionManualName]);

  const [restarting, setRestarting] = useState(false);

  const handleRestart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setRestarting(true);
      // Signal App.tsx to re-create this session with the same working_dir
      window.dispatchEvent(
        new CustomEvent("codegrid:restart-session", {
          detail: {
            sessionId: session.id,
            workingDir: session.working_dir,
            workspaceId: session.workspace_id,
            isShell: !session.command.includes("claude"),
            resume: false,
          },
        }),
      );
    },
    [session],
  );

  // Status-based border color for at-a-glance state awareness
  const statusColorMap: Record<string, string> = {
    idle: "#4a9eff",      // blue
    running: "#00c853",   // green
    waiting: "#ffab00",   // yellow/orange
    error: "#ff3d00",     // red
    dead: "#555555",      // gray
  };
  const statusColor = statusColorMap[session.status ?? "idle"] ?? "#4a9eff";

  const borderColor = broadcastMode
    ? "#ff8c00"
    : isFocused
      ? "#ff8c00"
      : statusColor + "80"; // 50% opacity for unfocused status borders

  return (
    <div
      onClick={handleFocus}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        border: `1px solid ${borderColor}`,
        background: "#0a0a0a",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Title bar */}
      <div
        className="drag-handle"
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        style={{
          height: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 6px",
          background: isFocused ? "#1e1e1e" : "#141414",
          borderLeft: isFocused ? "none" : `2px solid ${statusColor}`,
          borderBottom: "1px solid #2a2a2a",
          cursor: "move",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace" }}>
          <span
            style={{
              color: "#ff8c00", fontWeight: "bold", fontSize: "10px",
              width: "16px", height: "16px", display: "flex", alignItems: "center",
              justifyContent: "center", background: "#2a2a2a",
            }}
          >
            {session.pane_number}
          </span>
          <span
            style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: statusColor,
              boxShadow: session.status === "running" ? `0 0 4px ${statusColor}` : "none",
              flexShrink: 0,
            }}
          />
          {renaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#2a2a2a", border: "1px solid #ff8c00", color: "#e0e0e0",
                fontSize: "11px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                padding: "1px 4px", outline: "none", width: "120px",
              }}
              autoFocus
            />
          ) : (
            <span style={{ color: "#888888" }}>{displayName}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          {/* Minimize button */}
          <button
            onClick={handleMinimize}
            title="Minimize pane"
            aria-label={`Minimize pane ${session.pane_number}`}
            style={{
              background: "none", border: "none", color: "#555555", cursor: "pointer",
              fontSize: "12px", padding: "0 3px", lineHeight: 1,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ffab00")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
          >
            _
          </button>
          {/* Close button */}
          <button
            onClick={handleClose}
            title="Close pane (Cmd+W)"
            aria-label={`Close pane ${session.pane_number}`}
            style={{
              background: "none", border: "none", color: "#555555", cursor: "pointer",
              fontSize: "14px", padding: "0 2px", lineHeight: 1, fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ff3d00")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
          >
            x
          </button>
        </div>
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          style={{
            position: "fixed",
            top: ctxMenu.y,
            left: ctxMenu.x,
            background: "#1a1a1a",
            border: "1px solid #333333",
            zIndex: 9999,
            minWidth: "160px",
            fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
            fontSize: "11px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
          }}
        >
          {[
            { label: "Rename", action: () => startRename() },
            { label: isMaximized ? "Restore size" : "Maximize", action: () => { setCtxMenu(null); toggleMaximize(session.id); } },
            { label: "Minimize", action: () => { setCtxMenu(null); minimizePane(session.id); } },
            null, // divider
            { label: "Close", action: () => { setCtxMenu(null); onClose(session.id); }, danger: true },
          ].map((item, i) =>
            item === null ? (
              <div key={i} style={{ height: "1px", background: "#2a2a2a", margin: "2px 0" }} />
            ) : (
              <div
                key={item.label}
                onClick={item.action}
                style={{ padding: "7px 14px", cursor: "pointer", color: item.danger ? "#ff3d00" : "#cccccc" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2a2a")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {item.label}
              </div>
            )
          )}
        </div>
      )}

      {/* Terminal */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <TerminalView sessionId={session.id} />

        {/* Dead-session overlay: shown for sessions restored from DB on startup */}
        {session.status === "dead" && (
          <div
            style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              background: "rgba(10, 10, 10, 0.92)",
              gap: "12px",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              zIndex: 10,
            }}
          >
            <div style={{ color: "#555555", fontSize: "11px", letterSpacing: "1px" }}>
              {vibeMode ? "SESSION ENDED" : "DEAD"}
            </div>
            <div style={{ color: "#888888", fontSize: "10px", maxWidth: "200px", textAlign: "center", lineHeight: "1.5" }}>
              {session.working_dir.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~")}
            </div>
            <button
              onClick={handleRestart}
              disabled={restarting}
              style={{
                background: restarting ? "#333333" : "#ff8c00",
                border: "none",
                color: restarting ? "#666666" : "#0a0a0a",
                fontSize: "11px",
                fontWeight: "bold",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                padding: "8px 20px",
                cursor: restarting ? "default" : "pointer",
                letterSpacing: "0.5px",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { if (!restarting) e.currentTarget.style.background = "#ffa040"; }}
              onMouseLeave={(e) => { if (!restarting) e.currentTarget.style.background = "#ff8c00"; }}
            >
              {restarting ? "STARTING..." : (vibeMode ? "▶ RESTART" : "▶ RESTART SESSION")}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(session.id); }}
              style={{
                background: "transparent", border: "1px solid #333333",
                color: "#555555", fontSize: "9px",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                padding: "4px 12px", cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff3d00"; e.currentTarget.style.color = "#ff3d00"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#333333"; e.currentTarget.style.color = "#555555"; }}
            >
              CLOSE
            </button>
          </div>
        )}
      </div>

      {/* Status bar */}
      <StatusBar session={session} />

      {/* Broadcast indicator */}
      {broadcastMode && (
        <div
          style={{
            position: "absolute", top: "24px", right: "8px",
            fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
            color: "#ff8c00", background: "rgba(255, 140, 0, 0.15)",
            padding: "1px 4px", letterSpacing: "1px",
          }}
        >
          {vibeMode ? "TYPE TO ALL" : "BROADCAST"}
        </div>
      )}
    </div>
  );
});
