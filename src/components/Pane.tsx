import { memo, useCallback } from "react";
import { TerminalView } from "./Terminal";
import { StatusBar } from "./StatusBar";
import { ModelSwitcher } from "./ModelSwitcher";
import { useSessionStore } from "../stores/sessionStore";
import { useLayoutStore } from "../stores/layoutStore";
import type { SessionWithModel } from "../stores/sessionStore";

interface PaneProps {
  session: SessionWithModel;
  onClose: (sessionId: string) => void;
}

export const Pane = memo(function Pane({ session, onClose }: PaneProps) {
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId);
  const broadcastMode = useSessionStore((s) => s.broadcastMode);
  const setFocusedSession = useSessionStore((s) => s.setFocusedSession);
  const toggleMaximize = useLayoutStore((s) => s.toggleMaximize);
  const isFocused = focusedSessionId === session.id;
  const isClaude = session.command?.includes("claude");

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

  const handleDoubleClick = useCallback(() => {
    toggleMaximize(session.id);
  }, [session.id, toggleMaximize]);

  const borderColor = broadcastMode
    ? "#ff8c00"
    : isFocused
      ? "#ff8c00"
      : "#2a2a2a";

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
        style={{
          height: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 6px",
          background: isFocused ? "#1e1e1e" : "#141414",
          borderBottom: "1px solid #2a2a2a",
          cursor: "move",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontFamily: "'SF Mono', monospace" }}>
          <span
            style={{
              color: "#ff8c00", fontWeight: "bold", fontSize: "10px",
              width: "16px", height: "16px", display: "flex", alignItems: "center",
              justifyContent: "center", background: "#2a2a2a",
            }}
          >
            {session.pane_number}
          </span>
          <span style={{ color: "#888888" }}>
            {isClaude ? "claude" : "shell"}
          </span>
          {/* Per-pane model switcher for Claude sessions */}
          {isClaude && (
            <div onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }}>
              <ModelSwitcher sessionId={session.id} compact />
            </div>
          )}
        </div>
        <button
          onClick={handleClose}
          title="Close pane (Cmd+W)"
          style={{
            background: "none", border: "none", color: "#555555", cursor: "pointer",
            fontSize: "14px", padding: "0 2px", lineHeight: 1, fontFamily: "'SF Mono', monospace",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ff3d00")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
        >
          x
        </button>
      </div>

      {/* Terminal */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <TerminalView sessionId={session.id} />
      </div>

      {/* Status bar */}
      <StatusBar session={session} />

      {/* Broadcast indicator */}
      {broadcastMode && (
        <div
          style={{
            position: "absolute", top: "24px", right: "8px",
            fontSize: "9px", fontFamily: "'SF Mono', monospace",
            color: "#ff8c00", background: "rgba(255, 140, 0, 0.15)",
            padding: "1px 4px", letterSpacing: "1px",
          }}
        >
          BROADCAST
        </div>
      )}
    </div>
  );
});
