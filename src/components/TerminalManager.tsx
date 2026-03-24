import { memo, useCallback, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSessionStore, type SessionWithModel } from "../stores/sessionStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";

const AGENT_COLORS: Record<string, string> = {
  CLAUDE: "#ff8c00",
  CODEX: "#10a37f",
  GEMINI: "#4285f4",
  CURSOR: "#a855f7",
  SHELL: "#4a9eff",
};

const STATUS_COLORS: Record<string, string> = {
  idle: "#4a9eff",
  running: "#00c853",
  waiting: "#ffab00",
  error: "#ff3d00",
  dead: "#555555",
};

function detectAgent(command: string): { label: string; color: string } {
  const cmd = (command ?? "").toLowerCase();
  if (cmd.includes("claude")) return { label: "CLAUDE", color: AGENT_COLORS.CLAUDE };
  if (cmd.includes("codex")) return { label: "CODEX", color: AGENT_COLORS.CODEX };
  if (cmd.includes("gemini")) return { label: "GEMINI", color: AGENT_COLORS.GEMINI };
  if (cmd.includes("cursor") || /\bagent\b/.test(cmd)) return { label: "CURSOR", color: AGENT_COLORS.CURSOR };
  return { label: "SHELL", color: AGENT_COLORS.SHELL };
}

function shortenDir(dir: string): string {
  return dir.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

function closeSession(sessionId: string) {
  window.dispatchEvent(new CustomEvent("codegrid:close-session", { detail: { sessionId } }));
}

interface TerminalManagerProps {
  open: boolean;
  onClose: () => void;
}

export const TerminalManager = memo(function TerminalManager({ open, onClose }: TerminalManagerProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape or outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const clickHandler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", handler);
    // Delay click listener to avoid the opening click closing it immediately
    const timer = setTimeout(() => document.addEventListener("mousedown", clickHandler), 50);
    return () => {
      document.removeEventListener("keydown", handler);
      document.removeEventListener("mousedown", clickHandler);
      clearTimeout(timer);
    };
  }, [open, onClose]);

  const handleKill = useCallback((sessionId: string) => {
    setRemovingIds((prev) => new Set(prev).add(sessionId));
    setTimeout(() => {
      closeSession(sessionId);
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }, 250);
  }, []);

  const handleKillWorkspace = useCallback((workspaceId: string) => {
    const toKill = sessions.filter((s) => s.workspace_id === workspaceId);
    const ids = toKill.map((s) => s.id);
    setRemovingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setTimeout(() => {
      ids.forEach((id) => closeSession(id));
      setRemovingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }, 250);
  }, [sessions]);

  const handleKillAll = useCallback(() => {
    const ids = sessions.map((s) => s.id);
    setRemovingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setTimeout(() => {
      ids.forEach((id) => closeSession(id));
      setRemovingIds(new Set());
    }, 300);
  }, [sessions]);

  if (!open) return null;

  // Group sessions by workspace
  const grouped = new Map<string, SessionWithModel[]>();
  for (const s of sessions) {
    const list = grouped.get(s.workspace_id) ?? [];
    list.push(s);
    grouped.set(s.workspace_id, list);
  }

  const totalCount = sessions.length;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={panelRef}
        style={{
          background: "#0a0a0a",
          border: "1px solid #2a2a2a",
          borderRadius: "8px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.7)",
          fontFamily: MONO,
          width: "600px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid #1a1a1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "#ff8c00", fontWeight: "bold", fontSize: "12px", letterSpacing: "1px" }}>
              TERMINAL MANAGER
            </span>
            <span style={{ color: "#555", fontSize: "10px" }}>
              {totalCount} terminal{totalCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {totalCount > 0 && (
              <button
                onClick={handleKillAll}
                style={{
                  background: "#ff3d00",
                  border: "none",
                  color: "#fff",
                  fontSize: "9px",
                  fontFamily: MONO,
                  fontWeight: "bold",
                  letterSpacing: "0.5px",
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#ff6633")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#ff3d00")}
              >
                KILL ALL TERMINALS
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "#555",
                fontSize: "14px",
                cursor: "pointer",
                fontFamily: MONO,
                padding: "0 4px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#e0e0e0")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
            >
              x
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "8px 0", flex: 1 }}>
          {totalCount === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#444", fontSize: "11px" }}>
              No terminals running.
            </div>
          )}

          {Array.from(grouped.entries()).map(([wsId, wsSessions]) => {
            const ws = workspaces.find((w) => w.id === wsId);
            const wsName = ws?.name ?? "Unknown";
            return (
              <div key={wsId} style={{ marginBottom: "4px" }}>
                {/* Workspace header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 20px",
                    background: "#111",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: "#888", fontSize: "10px", fontWeight: "bold", letterSpacing: "1px" }}>
                      {wsName.toUpperCase()}
                    </span>
                    <span style={{ color: "#444", fontSize: "9px" }}>
                      {wsSessions.length}
                    </span>
                  </div>
                  {wsSessions.length > 1 && (
                    <button
                      onClick={() => handleKillWorkspace(wsId)}
                      style={{
                        background: "transparent",
                        border: "1px solid #ff3d0055",
                        color: "#ff3d00",
                        fontSize: "8px",
                        fontFamily: MONO,
                        fontWeight: "bold",
                        letterSpacing: "0.5px",
                        padding: "2px 8px",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#ff3d0020";
                        e.currentTarget.style.borderColor = "#ff3d00";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.borderColor = "#ff3d0055";
                      }}
                    >
                      KILL ALL
                    </button>
                  )}
                </div>

                {/* Session rows */}
                {wsSessions.map((session) => {
                  const { label: agentLabel, color: agentColor } = detectAgent(session.command);
                  const isDead = session.status === "dead";
                  const isRemoving = removingIds.has(session.id);
                  const displayName = session.manualName
                    ?? session.activityName
                    ?? agentLabel.toLowerCase();
                  const statusColor = STATUS_COLORS[session.status ?? "idle"] ?? "#555";

                  return (
                    <div
                      key={session.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 20px",
                        opacity: isRemoving ? 0 : isDead ? 0.4 : 1,
                        transform: isRemoving ? "translateX(40px)" : "translateX(0)",
                        transition: "opacity 0.25s ease, transform 0.25s ease",
                        borderBottom: "1px solid #141414",
                      }}
                    >
                      {/* Agent badge */}
                      <span
                        style={{
                          background: agentColor + "25",
                          color: agentColor,
                          fontSize: "8px",
                          fontWeight: "bold",
                          letterSpacing: "0.5px",
                          padding: "2px 6px",
                          borderRadius: "2px",
                          flexShrink: 0,
                          width: "48px",
                          textAlign: "center",
                        }}
                      >
                        {agentLabel}
                      </span>

                      {/* Pane number */}
                      <span style={{ color: "#ff8c00", fontSize: "9px", fontWeight: "bold", flexShrink: 0 }}>
                        [{session.pane_number}]
                      </span>

                      {/* Name + dir */}
                      <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
                        <div style={{
                          color: isDead ? "#555" : "#ccc",
                          fontSize: "10px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {displayName}
                        </div>
                        <div style={{
                          color: "#444",
                          fontSize: "9px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {shortenDir(session.working_dir)}
                        </div>
                      </div>

                      {/* Status */}
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                        <div style={{
                          width: "5px",
                          height: "5px",
                          borderRadius: "50%",
                          background: statusColor,
                        }} />
                        <span style={{
                          color: statusColor,
                          fontSize: "8px",
                          fontWeight: "bold",
                          letterSpacing: "0.5px",
                          textTransform: "uppercase",
                        }}>
                          {session.status ?? "idle"}
                        </span>
                      </div>

                      {/* Kill button */}
                      <button
                        onClick={() => handleKill(session.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid #ff3d0055",
                          color: "#ff3d00",
                          fontSize: "8px",
                          fontFamily: MONO,
                          fontWeight: "bold",
                          padding: "2px 8px",
                          cursor: "pointer",
                          flexShrink: 0,
                          letterSpacing: "0.5px",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#ff3d00";
                          e.currentTarget.style.color = "#fff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "#ff3d00";
                        }}
                      >
                        KILL
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
});
