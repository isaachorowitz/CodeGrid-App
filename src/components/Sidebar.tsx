import { memo, useCallback } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSessionStore } from "../stores/sessionStore";

interface SidebarProps {
  onFocusSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
}

const STATUS_DOTS: Record<string, string> = {
  idle: "#4a9eff",
  running: "#00c853",
  waiting: "#ffab00",
  error: "#ff3d00",
  dead: "#555555",
};

export const Sidebar = memo(function Sidebar({
  onFocusSession,
  onCloseSession,
}: SidebarProps) {
  const { workspaces, activeWorkspaceId, sidebarOpen } = useWorkspaceStore();
  const sessions = useSessionStore((s) => s.sessions);
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId);

  if (!sidebarOpen) return null;

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeSessions = sessions.filter(
    (s) => s.workspace_id === activeWorkspaceId,
  );

  return (
    <div
      style={{
        width: "220px",
        height: "100%",
        background: "#141414",
        borderRight: "1px solid #2a2a2a",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'SF Mono', 'Menlo', monospace",
        fontSize: "11px",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          color: "#ff8c00",
          fontWeight: "bold",
          fontSize: "10px",
          letterSpacing: "1px",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        SESSIONS
      </div>

      {/* Workspace name */}
      {activeWorkspace && (
        <div
          style={{
            padding: "6px 12px",
            color: "#888888",
            fontSize: "10px",
            borderBottom: "1px solid #1e1e1e",
          }}
        >
          {activeWorkspace.name}
        </div>
      )}

      {/* Session list */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeSessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onFocusSession(session.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              cursor: "pointer",
              background:
                session.id === focusedSessionId
                  ? "#1e1e1e"
                  : "transparent",
              borderLeft:
                session.id === focusedSessionId
                  ? "2px solid #ff8c00"
                  : "2px solid transparent",
            }}
            onMouseEnter={(e) => {
              if (session.id !== focusedSessionId) {
                e.currentTarget.style.background = "#1a1a1a";
              }
            }}
            onMouseLeave={(e) => {
              if (session.id !== focusedSessionId) {
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            {/* Status dot */}
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: STATUS_DOTS[session.status] ?? "#555555",
                flexShrink: 0,
              }}
            />

            {/* Pane number */}
            <span style={{ color: "#ff8c00", fontWeight: "bold" }}>
              {session.pane_number}
            </span>

            {/* Directory */}
            <span
              style={{
                color: "#e0e0e0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {session.working_dir.split("/").pop() || session.working_dir}
            </span>

            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseSession(session.id);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#555555",
                cursor: "pointer",
                fontSize: "10px",
                padding: "0 2px",
                fontFamily: "'SF Mono', monospace",
                visibility: "hidden",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#ff3d00")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
              ref={(el) => {
                // Show on parent hover
                const parent = el?.parentElement;
                if (parent) {
                  parent.onmouseenter = () => {
                    if (el) el.style.visibility = "visible";
                  };
                  parent.onmouseleave = () => {
                    if (el) el.style.visibility = "hidden";
                  };
                }
              }}
            >
              x
            </button>
          </div>
        ))}

        {activeSessions.length === 0 && (
          <div
            style={{
              padding: "16px 12px",
              color: "#555555",
              textAlign: "center",
              fontSize: "10px",
            }}
          >
            No sessions yet.
            <br />
            Press Cmd+N to create one.
          </div>
        )}
      </div>

      {/* Footer with session count */}
      <div
        style={{
          padding: "6px 12px",
          borderTop: "1px solid #2a2a2a",
          color: "#555555",
          fontSize: "10px",
        }}
      >
        {activeSessions.length} session{activeSessions.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
});
