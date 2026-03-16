import { memo, useState, useEffect, useCallback } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSessionStore } from "../stores/sessionStore";
import { useAppStore } from "../stores/appStore";
import { useToastStore } from "../stores/toastStore";
import {
  deleteWorkspace, setActiveWorkspace as setActiveWorkspaceIpc,
  gitStatus, gitPush, gitPull,
  type GitStatusInfo,
} from "../lib/ipc";

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

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-6": "#d500f9",
  "claude-sonnet-4-6": "#ff8c00",
  "claude-haiku-4-5": "#00e5ff",
};

const MODEL_SHORT: Record<string, string> = {
  "claude-opus-4-6": "O",
  "claude-sonnet-4-6": "S",
  "claude-haiku-4-5": "H",
};

export const Sidebar = memo(function Sidebar({
  onFocusSession,
  onCloseSession,
}: SidebarProps) {
  const { workspaces, activeWorkspaceId, sidebarOpen, deleteConfirmId, setDeleteConfirmId, setActiveWorkspace, removeWorkspace } = useWorkspaceStore();
  const sessions = useSessionStore((s) => s.sessions);
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId);
  const { setSkillsPanelOpen, setHubBrowserOpen, setGitManagerOpen, setMcpManagerOpen, setClaudeMdEditorOpen } = useAppStore();
  const addToast = useToastStore((s) => s.addToast);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [workspaceGitStatus, setWorkspaceGitStatus] = useState<GitStatusInfo | null>(null);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeSessions = sessions.filter((s) => s.workspace_id === activeWorkspaceId);

  // Fetch git status for active workspace repo
  useEffect(() => {
    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
    if (!dir) { setWorkspaceGitStatus(null); return; }
    gitStatus(dir).then(setWorkspaceGitStatus).catch(() => setWorkspaceGitStatus(null));
    const interval = setInterval(() => {
      gitStatus(dir).then(setWorkspaceGitStatus).catch(() => setWorkspaceGitStatus(null));
    }, 15000);
    return () => clearInterval(interval);
  }, [activeWorkspace?.repo_path, activeSessions.length > 0 ? activeSessions[0]?.working_dir : null]);

  const handleQuickPush = useCallback(async () => {
    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
    if (!dir) return;
    try {
      await gitPush(dir, !workspaceGitStatus?.has_remote);
      addToast("Pushed successfully", "success");
      const s = await gitStatus(dir);
      setWorkspaceGitStatus(s);
    } catch (e) { addToast(`Push failed: ${e}`, "error"); }
  }, [activeWorkspace, activeSessions, workspaceGitStatus, addToast]);

  const handleQuickPull = useCallback(async () => {
    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
    if (!dir) return;
    try {
      await gitPull(dir);
      addToast("Pulled successfully", "success");
      const s = await gitStatus(dir);
      setWorkspaceGitStatus(s);
    } catch (e) { addToast(`Pull failed: ${e}`, "error"); }
  }, [activeWorkspace, activeSessions, addToast]);

  const handleDeleteWorkspace = useCallback(async (wsId: string) => {
    if (deleteConfirmId !== wsId) {
      setDeleteConfirmId(wsId);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }
    try {
      await deleteWorkspace(wsId);
      removeWorkspace(wsId);
      addToast("Workspace deleted", "info");
    } catch (e) { addToast(`Delete failed: ${e}`, "error"); }
  }, [deleteConfirmId, setDeleteConfirmId, removeWorkspace, addToast]);

  const handleSwitchWorkspace = useCallback(async (wsId: string) => {
    setActiveWorkspace(wsId);
    try { await setActiveWorkspaceIpc(wsId); } catch {}
  }, [setActiveWorkspace]);

  if (!sidebarOpen) return null;

  const totalChanges = (workspaceGitStatus?.staged.length ?? 0)
    + (workspaceGitStatus?.unstaged.length ?? 0)
    + (workspaceGitStatus?.untracked.length ?? 0);

  return (
    <div
      style={{
        width: "240px",
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
      {/* Workspaces section */}
      <div style={{ borderBottom: "1px solid #2a2a2a" }}>
        <div style={{ padding: "8px 12px", color: "#ff8c00", fontWeight: "bold", fontSize: "10px", letterSpacing: "1px" }}>
          WORKSPACES
        </div>
        <div style={{ maxHeight: "120px", overflow: "auto" }}>
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              onClick={() => handleSwitchWorkspace(ws.id)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "5px 12px", cursor: "pointer",
                background: ws.id === activeWorkspaceId ? "#1e1e1e" : "transparent",
                borderLeft: ws.id === activeWorkspaceId ? "2px solid #ff8c00" : "2px solid transparent",
              }}
              onMouseEnter={(e) => { if (ws.id !== activeWorkspaceId) e.currentTarget.style.background = "#1a1a1a"; }}
              onMouseLeave={(e) => { if (ws.id !== activeWorkspaceId) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ color: ws.id === activeWorkspaceId ? "#ff8c00" : "#888888", fontWeight: "bold", fontSize: "10px", width: "14px", height: "14px", display: "flex", alignItems: "center", justifyContent: "center", background: "#2a2a2a", flexShrink: 0 }}>
                {ws.name[0]?.toUpperCase() ?? "?"}
              </span>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <span style={{ color: ws.id === activeWorkspaceId ? "#e0e0e0" : "#888888", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                  {ws.name}
                </span>
                {ws.repo_path && (
                  <span style={{ color: "#555555", fontSize: "9px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ws.repo_path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~")}
                  </span>
                )}
              </div>
              {workspaces.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteWorkspace(ws.id); }}
                  style={{
                    background: "none", border: "none",
                    color: deleteConfirmId === ws.id ? "#ff3d00" : "#333333",
                    cursor: "pointer", fontSize: "9px", padding: "0 2px",
                    fontFamily: "'SF Mono', monospace",
                  }}
                  title={deleteConfirmId === ws.id ? "Click again to confirm" : "Delete workspace"}
                >
                  {deleteConfirmId === ws.id ? "DEL?" : "x"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Git status bar for active workspace */}
      {workspaceGitStatus && (
        <div style={{ padding: "6px 12px", borderBottom: "1px solid #2a2a2a", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "#d500f9", fontSize: "10px", fontWeight: "bold" }}>{workspaceGitStatus.branch}</span>
            {workspaceGitStatus.ahead > 0 && <span style={{ color: "#00c853", fontSize: "9px" }}>+{workspaceGitStatus.ahead}</span>}
            {workspaceGitStatus.behind > 0 && <span style={{ color: "#ff3d00", fontSize: "9px" }}>-{workspaceGitStatus.behind}</span>}
            {totalChanges > 0 && <span style={{ color: "#ffab00", fontSize: "9px" }}>{totalChanges} changes</span>}
          </div>
          <div style={{ display: "flex", gap: "2px" }}>
            <button onClick={handleQuickPull} style={{
              flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#4a9eff",
              fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: "pointer", padding: "3px",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4a9eff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >PULL</button>
            <button onClick={handleQuickPush} style={{
              flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#00c853",
              fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: "pointer", padding: "3px",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#00c853"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >
              PUSH{workspaceGitStatus.ahead > 0 ? ` (${workspaceGitStatus.ahead})` : ""}
            </button>
            <button onClick={() => {
              const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
              setGitManagerOpen(true, dir);
            }} style={{
              flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#ff8c00",
              fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: "pointer", padding: "3px",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >GIT</button>
          </div>
        </div>
      )}

      {/* Sessions header */}
      <div style={{ padding: "8px 12px", color: "#ff8c00", fontWeight: "bold", fontSize: "10px", letterSpacing: "1px", borderBottom: "1px solid #2a2a2a" }}>
        SESSIONS ({activeSessions.length})
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeSessions.map((session) => {
          const isClaude = session.command?.includes("claude");
          const modelColor = MODEL_COLORS[session.model ?? ""] ?? "#888888";
          const modelLetter = MODEL_SHORT[session.model ?? ""] ?? "";

          return (
            <div
              key={session.id}
              onClick={() => onFocusSession(session.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                cursor: "pointer",
                background: session.id === focusedSessionId ? "#1e1e1e" : "transparent",
                borderLeft: session.id === focusedSessionId ? "2px solid #ff8c00" : "2px solid transparent",
              }}
              onMouseEnter={(e) => {
                setHoveredSession(session.id);
                if (session.id !== focusedSessionId) e.currentTarget.style.background = "#1a1a1a";
              }}
              onMouseLeave={(e) => {
                setHoveredSession(null);
                if (session.id !== focusedSessionId) e.currentTarget.style.background = "transparent";
              }}
            >
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: STATUS_DOTS[session.status] ?? "#555555", flexShrink: 0 }} />
              <span style={{ color: "#ff8c00", fontWeight: "bold" }}>{session.pane_number}</span>
              {isClaude && modelLetter && (
                <span style={{ color: modelColor, fontSize: "8px", fontWeight: "bold", width: "12px", height: "12px", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${modelColor}66`, flexShrink: 0 }}>
                  {modelLetter}
                </span>
              )}
              <div style={{ flex: 1, overflow: "hidden" }}>
                <span style={{ color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", fontSize: "11px" }}>
                  {session.working_dir.split("/").pop() || session.working_dir}
                </span>
                {session.git_branch && (
                  <span style={{ color: "#d500f9", fontSize: "9px" }}>({session.git_branch})</span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onCloseSession(session.id); }}
                aria-label={`Close session ${session.pane_number}`}
                style={{
                  background: "none", border: "none", color: "#555555", cursor: "pointer",
                  fontSize: "10px", padding: "0 2px", fontFamily: "'SF Mono', monospace",
                  visibility: hoveredSession === session.id ? "visible" : "hidden",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ff3d00")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
              >
                x
              </button>
            </div>
          );
        })}

        {activeSessions.length === 0 && (
          <div style={{ padding: "16px 12px", color: "#555555", textAlign: "center", fontSize: "10px" }}>
            No sessions yet.
            <br />
            Press Cmd+N to start.
          </div>
        )}
      </div>

      {/* Tool buttons */}
      <div style={{ borderTop: "1px solid #2a2a2a", padding: "6px 8px", display: "flex", gap: "2px", flexWrap: "wrap" }}>
        {[
          { label: "HUB", onClick: () => setHubBrowserOpen(true), hoverColor: "#00c853" },
          { label: "SKILLS", onClick: () => setSkillsPanelOpen(true), hoverColor: "#4a9eff" },
          { label: "MCP", onClick: () => {
            const focused = sessions.find((s) => s.id === focusedSessionId);
            setMcpManagerOpen(true, focused?.working_dir ?? activeWorkspace?.repo_path ?? undefined);
          }, hoverColor: "#d500f9" },
          { label: "CLAUDE.md", onClick: () => {
            const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
            if (dir) setClaudeMdEditorOpen(true, dir);
            else addToast("No project directory — open a session first", "warning");
          }, hoverColor: "#ffab00" },
        ].map((btn) => (
          <button
            key={btn.label}
            onClick={btn.onClick}
            style={{
              flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888888",
              fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
              padding: "4px 2px", textAlign: "center", minWidth: "40px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = btn.hoverColor; e.currentTarget.style.borderColor = btn.hoverColor; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#888888"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
});
