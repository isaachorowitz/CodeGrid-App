import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Grid } from "./components/Grid";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { CommandPalette } from "./components/CommandPalette";
import { NewSessionDialog } from "./components/NewSessionDialog";
import { Settings } from "./components/Settings";
import { SkillsPanel } from "./components/SkillsPanel";
import { HubBrowser } from "./components/HubBrowser";
import { GitManager } from "./components/GitManager";
import { McpManager } from "./components/McpManager";
import { ClaudeMdEditor } from "./components/ClaudeMdEditor";
import { GitSetupWizard } from "./components/GitSetupWizard";
import { CodeViewer } from "./components/CodeViewer";
import { ToastContainer } from "./components/ToastContainer";
import { useSessionStore } from "./stores/sessionStore";
import { useLayoutStore } from "./stores/layoutStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useAppStore } from "./stores/appStore";
import { useToastStore } from "./stores/toastStore";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import {
  createSession,
  killSession,
  createWorkspace,
  createWorkspaceWithRepo,
  getWorkspaces,
  saveLayout as saveLayoutIpc,
  spawnShellSession,
  listRecentDirs,
  detectClaudeSkills,
  getAvailableModels,
  setActiveWorkspace as setActiveWorkspaceIpc,
  checkGitSetup,
} from "./lib/ipc";

export default function App() {
  const {
    sessions: allSessions,
    addSession,
    removeSession,
    setFocusedSession,
  } = useSessionStore();
  const { layouts, addPaneLayout, removePaneLayout, setLayouts } = useLayoutStore();
  const {
    workspaces,
    activeWorkspaceId,
    setWorkspaces,
    addWorkspace,
    setActiveWorkspace,
    updateWorkspace,
    sidebarOpen,
    setNewSessionDialogOpen,
  } = useWorkspaceStore();
  const { setSkills, setModels, setRecentDirs, defaultModel, setGitSetupWizardOpen } = useAppStore();
  const addToast = useToastStore((s) => s.addToast);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  // Filter sessions to only those belonging to the active workspace
  const sessions = useMemo(
    () => allSessions.filter((s) => s.workspace_id === activeWorkspaceId),
    [allSessions, activeWorkspaceId],
  );

  useKeyboardNav();

  // Initialize app: workspace, skills, models, recent dirs
  useEffect(() => {
    const init = async () => {
      // Load workspaces
      try {
        const existing = await getWorkspaces();
        if (existing.length > 0) {
          setWorkspaces(existing);
          const active = existing.find((w) => w.is_active) ?? existing[0];
          setActiveWorkspace(active.id);
          if (active.layout_json) {
            try { setLayouts(JSON.parse(active.layout_json)); } catch {}
          }
        } else {
          const ws = await createWorkspace("Default");
          addWorkspace(ws);
        }
      } catch {
        const mockWs = {
          id: "mock-workspace", name: "Default", layout_json: null,
          created_at: new Date().toISOString(), is_active: true, repo_path: null,
        };
        setWorkspaces([mockWs]);
        setActiveWorkspace(mockWs.id);
      }

      // Load skills
      try { const skills = await detectClaudeSkills(); setSkills(skills); } catch {}

      // Load models
      try { const models = await getAvailableModels(); setModels(models); } catch {}

      // Load recent dirs
      try { const dirs = await listRecentDirs(); setRecentDirs(dirs); } catch {}

      // Auto-open Git Setup Wizard on first launch if git is not configured
      try {
        const gitStatus = await checkGitSetup();
        if (!gitStatus.git_installed || !gitStatus.git_user_name || !gitStatus.git_user_email || !gitStatus.gh_authenticated) {
          setGitSetupWizardOpen(true);
        }
      } catch {}
    };
    init();
  }, []);

  // Track container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Persist layout (including empty layouts so closing all sessions clears saved state)
  useEffect(() => {
    if (!activeWorkspaceId) return;
    const layoutJson = JSON.stringify(layouts);
    // Keep workspace store in sync so workspace switching can read current layout
    updateWorkspace(activeWorkspaceId, { layout_json: layoutJson });
    const timer = setTimeout(() => {
      saveLayoutIpc(activeWorkspaceId, layoutJson).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [layouts, activeWorkspaceId, updateWorkspace]);

  // Broadcast input routing (only to sessions in the active workspace)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      for (const session of sessions) {
        window.dispatchEvent(new CustomEvent("gridcode:broadcast-write", { detail: { sessionId: session.id, data: detail.data } }));
      }
    };
    window.addEventListener("gridcode:broadcast-input", handler);
    return () => window.removeEventListener("gridcode:broadcast-input", handler);
  }, [sessions]);

  // New workspace events
  useEffect(() => {
    const handler = async () => {
      try {
        const ws = await createWorkspace(`Workspace ${workspaces.length + 1}`);
        addWorkspace(ws);
      } catch {}
    };
    window.addEventListener("gridcode:new-workspace", handler);
    return () => window.removeEventListener("gridcode:new-workspace", handler);
  }, [workspaces.length, addWorkspace]);

  // New workspace with repo event
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      try {
        const ws = await createWorkspaceWithRepo(detail.name, detail.repoPath);
        addWorkspace(ws);
        addToast(`Workspace "${ws.name}" created`, "success");
      } catch (err) {
        addToast(`Failed to create workspace: ${err}`, "error");
      }
    };
    window.addEventListener("gridcode:new-workspace-with-repo", handler);
    return () => window.removeEventListener("gridcode:new-workspace-with-repo", handler);
  }, [addWorkspace, addToast]);

  // Quick session from Hub
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      handleCreateSession(detail.path, false, false, detail.type === "shell");
    };
    window.addEventListener("gridcode:quick-session", handler);
    return () => window.removeEventListener("gridcode:quick-session", handler);
  }, [activeWorkspaceId]);

  const handleCreateSession = useCallback(
    async (workingDir: string, useWorktree: boolean, resume: boolean, isShell: boolean) => {
      if (!activeWorkspaceId) return;
      try {
        let session;
        if (isShell) {
          session = await spawnShellSession(workingDir, activeWorkspaceId);
        } else {
          session = await createSession(workingDir, activeWorkspaceId, useWorktree, resume);
        }
        addSession(session, defaultModel);
        addPaneLayout(session.id);
        setFocusedSession(session.id);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("gridcode:focus-terminal", { detail: { sessionId: session.id } }));
        }, 200);
      } catch (e) {
        addToast(`Failed to create session: ${e}`, "error");
      }
    },
    [activeWorkspaceId, addSession, addPaneLayout, setFocusedSession, defaultModel, addToast],
  );

  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      try { await killSession(sessionId); } catch {}
      removeSession(sessionId);
      removePaneLayout(sessionId);
    },
    [removeSession, removePaneLayout],
  );

  // Close session events (must be after handleCloseSession declaration)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      handleCloseSession(detail.sessionId);
    };
    window.addEventListener("gridcode:close-session", handler);
    return () => window.removeEventListener("gridcode:close-session", handler);
  }, [handleCloseSession]);

  const handleFocusSession = useCallback(
    (sessionId: string) => {
      setFocusedSession(sessionId);
      window.dispatchEvent(new CustomEvent("gridcode:focus-terminal", { detail: { sessionId } }));
    },
    [setFocusedSession],
  );

  const gridWidth = sidebarOpen ? dimensions.width - 240 : dimensions.width;
  const gridHeight = dimensions.height - 58;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", background: "#0a0a0a", overflow: "hidden" }}>
      <TopBar onFocusSession={handleFocusSession} onCloseSession={handleCloseSession} />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar />
        <div ref={containerRef} style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {sessions.length === 0 ? (
            <EmptyState onNewSession={() => setNewSessionDialogOpen(true)} />
          ) : (
            <Grid width={gridWidth} height={gridHeight} onCloseSession={handleCloseSession} />
          )}
        </div>
      </div>

      {/* Overlays */}
      <CommandPalette />
      <NewSessionDialog onCreateSession={handleCreateSession} />
      <Settings />
      <SkillsPanel />
      <HubBrowser />
      <GitManager />
      <McpManager />
      <ClaudeMdEditor />
      <GitSetupWizard />
      <CodeViewer />
      <ToastContainer />
    </div>
  );
}

function EmptyState({ onNewSession }: { onNewSession: () => void }) {
  const { setHubBrowserOpen, setSkillsPanelOpen, recentDirs } = useAppStore();
  const setNewSessionDialogOpen = useWorkspaceStore((s) => s.setNewSessionDialogOpen);

  const handleQuickOpen = (dir: string) => {
    window.dispatchEvent(new CustomEvent("gridcode:quick-session", { detail: { path: dir, type: "claude" } }));
  };

  const handleCreateWorkspaceFromRepo = (dir: string) => {
    const name = dir.split("/").pop() ?? "Workspace";
    window.dispatchEvent(new CustomEvent("gridcode:new-workspace-with-repo", { detail: { name, repoPath: dir } }));
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        fontFamily: "'SF Mono', 'Menlo', monospace",
        color: "#555555",
        gap: "16px",
        padding: "40px",
      }}
    >
      {/* Logo */}
      <div style={{ fontSize: "48px", fontWeight: "bold", color: "#2a2a2a", letterSpacing: "4px" }}>
        GRIDCODE
      </div>
      <div style={{ fontSize: "12px", color: "#555555", marginBottom: "8px" }}>
        Bloomberg Terminal for Claude Code — multi-project AI workspaces
      </div>

      {/* Big action buttons */}
      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
        <button
          onClick={onNewSession}
          style={{
            background: "#ff8c00", border: "none", color: "#0a0a0a",
            fontSize: "13px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
            padding: "14px 28px", fontWeight: "bold", letterSpacing: "1px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#ffa040")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#ff8c00")}
        >
          NEW SESSION
        </button>
        <button
          onClick={() => setHubBrowserOpen(true)}
          style={{
            background: "#1e1e1e", border: "1px solid #00c853", color: "#00c853",
            fontSize: "13px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
            padding: "14px 28px", fontWeight: "bold", letterSpacing: "1px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#00c85322")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#1e1e1e")}
        >
          CLONE A REPO
        </button>
        <button
          onClick={() => setSkillsPanelOpen(true)}
          style={{
            background: "#1e1e1e", border: "1px solid #4a9eff", color: "#4a9eff",
            fontSize: "13px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
            padding: "14px 28px", fontWeight: "bold", letterSpacing: "1px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#4a9eff22")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#1e1e1e")}
        >
          VIEW SKILLS
        </button>
      </div>

      {/* Recent projects */}
      {recentDirs.length > 0 && (
        <div style={{ marginTop: "24px", width: "100%", maxWidth: "700px" }}>
          <div style={{ color: "#888888", fontSize: "10px", letterSpacing: "1px", marginBottom: "8px", fontWeight: "bold" }}>
            RECENT PROJECTS — CLICK TO START SESSION, DOUBLE-CLICK TO CREATE WORKSPACE
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
            {recentDirs.slice(0, 8).map((dir) => (
              <button
                key={dir}
                onClick={() => handleQuickOpen(dir)}
                onDoubleClick={(e) => { e.preventDefault(); handleCreateWorkspaceFromRepo(dir); }}
                style={{
                  background: "#141414", border: "1px solid #2a2a2a", color: "#e0e0e0",
                  fontSize: "11px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
                  padding: "10px 12px", textAlign: "left", display: "flex", alignItems: "center",
                  gap: "8px",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; e.currentTarget.style.background = "#1e1e1e"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.background = "#141414"; }}
              >
                <span style={{ color: "#ff8c00", fontWeight: "bold", fontSize: "14px" }}>
                  {(dir.split("/").pop() || "?")[0]?.toUpperCase()}
                </span>
                <div style={{ overflow: "hidden", flex: 1 }}>
                  <div style={{ fontWeight: "bold", fontSize: "11px" }}>
                    {dir.split("/").pop()}
                  </div>
                  <div style={{ color: "#555555", fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {dir.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard hints */}
      <div
        style={{
          marginTop: "20px", fontSize: "10px", color: "#333333",
          display: "grid", gridTemplateColumns: "auto auto auto auto", gap: "4px 16px",
        }}
      >
        <span style={{ color: "#555555" }}>Cmd+N</span><span>New Session</span>
        <span style={{ color: "#555555" }}>Cmd+K</span><span>Command Palette</span>
        <span style={{ color: "#555555" }}>Cmd+B</span><span>Broadcast to All</span>
        <span style={{ color: "#555555" }}>Cmd+Enter</span><span>Maximize Pane</span>
        <span style={{ color: "#555555" }}>Cmd+S</span><span>Toggle Sidebar</span>
        <span style={{ color: "#555555" }}>Cmd+Tab</span><span>Switch Workspace</span>
      </div>
    </div>
  );
}
