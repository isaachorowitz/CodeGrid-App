import { useCallback, useEffect, useState, useRef } from "react";
import { Grid } from "./components/Grid";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { CommandPalette } from "./components/CommandPalette";
import { NewSessionDialog } from "./components/NewSessionDialog";
import { Settings } from "./components/Settings";
import { SkillsPanel } from "./components/SkillsPanel";
import { HubBrowser } from "./components/HubBrowser";
import { useSessionStore } from "./stores/sessionStore";
import { useLayoutStore } from "./stores/layoutStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useAppStore } from "./stores/appStore";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import {
  createSession,
  killSession,
  createWorkspace,
  getWorkspaces,
  saveLayout as saveLayoutIpc,
  spawnShellSession,
  listRecentDirs,
  detectClaudeSkills,
  getAvailableModels,
} from "./lib/ipc";

export default function App() {
  const {
    sessions,
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
    sidebarOpen,
    setNewSessionDialogOpen,
  } = useWorkspaceStore();
  const { setSkills, setModels, setRecentDirs, defaultModel } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

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
          created_at: new Date().toISOString(), is_active: true,
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

  // Persist layout
  useEffect(() => {
    if (!activeWorkspaceId || layouts.length === 0) return;
    const timer = setTimeout(() => {
      saveLayoutIpc(activeWorkspaceId, JSON.stringify(layouts)).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [layouts, activeWorkspaceId]);

  // Broadcast input routing
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

  // Close session events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      handleCloseSession(detail.sessionId);
    };
    window.addEventListener("gridcode:close-session", handler);
    return () => window.removeEventListener("gridcode:close-session", handler);
  }, []);

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
        console.error("Failed to create session:", e);
      }
    },
    [activeWorkspaceId, addSession, addPaneLayout, setFocusedSession, defaultModel],
  );

  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      try { await killSession(sessionId); } catch {}
      removeSession(sessionId);
      removePaneLayout(sessionId);
    },
    [removeSession, removePaneLayout],
  );

  const handleFocusSession = useCallback(
    (sessionId: string) => {
      setFocusedSession(sessionId);
      window.dispatchEvent(new CustomEvent("gridcode:focus-terminal", { detail: { sessionId } }));
    },
    [setFocusedSession],
  );

  const gridWidth = sidebarOpen ? dimensions.width - 220 : dimensions.width;
  // TopBar is now ~58px (32 + 26)
  const gridHeight = dimensions.height - 58;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", background: "#0a0a0a", overflow: "hidden" }}>
      <TopBar />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar onFocusSession={handleFocusSession} onCloseSession={handleCloseSession} />
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
    </div>
  );
}

function EmptyState({ onNewSession }: { onNewSession: () => void }) {
  const { setHubBrowserOpen, setSkillsPanelOpen, recentDirs } = useAppStore();
  const setNewSessionDialogOpen = useWorkspaceStore((s) => s.setNewSessionDialogOpen);

  const handleQuickOpen = (dir: string) => {
    window.dispatchEvent(new CustomEvent("gridcode:quick-session", { detail: { path: dir, type: "claude" } }));
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
        The easiest way to run Claude Code across multiple projects
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
        <div style={{ marginTop: "24px", width: "100%", maxWidth: "600px" }}>
          <div style={{ color: "#888888", fontSize: "10px", letterSpacing: "1px", marginBottom: "8px", fontWeight: "bold" }}>
            RECENT PROJECTS — CLICK TO START
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
            {recentDirs.slice(0, 8).map((dir) => (
              <button
                key={dir}
                onClick={() => handleQuickOpen(dir)}
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
                <div style={{ overflow: "hidden" }}>
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
          display: "grid", gridTemplateColumns: "auto auto", gap: "4px 16px",
        }}
      >
        <span style={{ color: "#555555" }}>Cmd+N</span><span>New Session</span>
        <span style={{ color: "#555555" }}>Cmd+K</span><span>Command Palette</span>
        <span style={{ color: "#555555" }}>Cmd+B</span><span>Broadcast to All</span>
        <span style={{ color: "#555555" }}>Cmd+Enter</span><span>Maximize Pane</span>
      </div>
    </div>
  );
}
