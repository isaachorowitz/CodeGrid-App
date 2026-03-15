import { useCallback, useEffect, useState, useRef } from "react";
import { Grid } from "./components/Grid";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { CommandPalette } from "./components/CommandPalette";
import { NewSessionDialog } from "./components/NewSessionDialog";
import { Settings } from "./components/Settings";
import { useSessionStore } from "./stores/sessionStore";
import { useLayoutStore } from "./stores/layoutStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import {
  createSession,
  killSession,
  createWorkspace,
  getWorkspaces,
  saveLayout as saveLayoutIpc,
  spawnShellSession,
} from "./lib/ipc";

export default function App() {
  const {
    sessions,
    addSession,
    removeSession,
    setFocusedSession,
    broadcastMode,
  } = useSessionStore();
  const { layouts, addPaneLayout, removePaneLayout, setLayouts } =
    useLayoutStore();
  const {
    workspaces,
    activeWorkspaceId,
    setWorkspaces,
    addWorkspace,
    setActiveWorkspace,
    sidebarOpen,
  } = useWorkspaceStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  // Keyboard navigation
  useKeyboardNav();

  // Initialize: load or create default workspace
  useEffect(() => {
    const init = async () => {
      try {
        const existing = await getWorkspaces();
        if (existing.length > 0) {
          setWorkspaces(existing);
          const active = existing.find((w) => w.is_active) ?? existing[0];
          setActiveWorkspace(active.id);

          // Restore layout if saved
          if (active.layout_json) {
            try {
              const parsed = JSON.parse(active.layout_json);
              setLayouts(parsed);
            } catch {
              // Invalid layout JSON
            }
          }
        } else {
          const ws = await createWorkspace("Default");
          addWorkspace(ws);
        }
      } catch {
        // Not in Tauri — provide a mock workspace for dev
        const mockWs = {
          id: "mock-workspace",
          name: "Default",
          layout_json: null,
          created_at: new Date().toISOString(),
          is_active: true,
        };
        setWorkspaces([mockWs]);
        setActiveWorkspace(mockWs.id);
      }
    };
    init();
  }, []);

  // Track container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Persist layout on changes
  useEffect(() => {
    if (!activeWorkspaceId || layouts.length === 0) return;
    const timer = setTimeout(() => {
      saveLayoutIpc(activeWorkspaceId, JSON.stringify(layouts)).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [layouts, activeWorkspaceId]);

  // Handle broadcast input routing
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      // Forward to all terminals
      for (const session of sessions) {
        window.dispatchEvent(
          new CustomEvent("gridcode:broadcast-write", {
            detail: { sessionId: session.id, data: detail.data },
          }),
        );
      }
    };
    window.addEventListener("gridcode:broadcast-input", handler);
    return () => window.removeEventListener("gridcode:broadcast-input", handler);
  }, [sessions]);

  // Handle close session events from keyboard shortcuts
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      handleCloseSession(detail.sessionId);
    };
    window.addEventListener("gridcode:close-session", handler);
    return () => window.removeEventListener("gridcode:close-session", handler);
  }, []);

  // Handle new workspace events
  useEffect(() => {
    const handler = async () => {
      try {
        const ws = await createWorkspace(
          `Workspace ${workspaces.length + 1}`,
        );
        addWorkspace(ws);
      } catch (e) {
        console.error("Failed to create workspace:", e);
      }
    };
    window.addEventListener("gridcode:new-workspace", handler);
    return () => window.removeEventListener("gridcode:new-workspace", handler);
  }, [workspaces.length, addWorkspace]);

  const handleCreateSession = useCallback(
    async (
      workingDir: string,
      useWorktree: boolean,
      resume: boolean,
      isShell: boolean,
    ) => {
      if (!activeWorkspaceId) return;

      try {
        let session;
        if (isShell) {
          session = await spawnShellSession(workingDir, activeWorkspaceId);
        } else {
          session = await createSession(
            workingDir,
            activeWorkspaceId,
            useWorktree,
            resume,
          );
        }
        addSession(session);
        addPaneLayout(session.id);
        setFocusedSession(session.id);

        // Focus the terminal after a brief delay
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("gridcode:focus-terminal", {
              detail: { sessionId: session.id },
            }),
          );
        }, 200);
      } catch (e) {
        console.error("Failed to create session:", e);
      }
    },
    [activeWorkspaceId, addSession, addPaneLayout, setFocusedSession],
  );

  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      try {
        await killSession(sessionId);
      } catch {
        // Already dead
      }
      removeSession(sessionId);
      removePaneLayout(sessionId);
    },
    [removeSession, removePaneLayout],
  );

  const handleFocusSession = useCallback(
    (sessionId: string) => {
      setFocusedSession(sessionId);
      window.dispatchEvent(
        new CustomEvent("gridcode:focus-terminal", {
          detail: { sessionId },
        }),
      );
    },
    [setFocusedSession],
  );

  const gridWidth = sidebarOpen ? dimensions.width - 220 : dimensions.width;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: "#0a0a0a",
        overflow: "hidden",
      }}
    >
      <TopBar />

      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <Sidebar
          onFocusSession={handleFocusSession}
          onCloseSession={handleCloseSession}
        />

        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {sessions.length === 0 ? (
            <EmptyState
              onNewSession={() =>
                useWorkspaceStore.getState().setNewSessionDialogOpen(true)
              }
            />
          ) : (
            <Grid
              width={gridWidth}
              height={dimensions.height - 32}
              onCloseSession={handleCloseSession}
            />
          )}
        </div>
      </div>

      {/* Overlays */}
      <CommandPalette />
      <NewSessionDialog onCreateSession={handleCreateSession} />
      <Settings />
    </div>
  );
}

function EmptyState({ onNewSession }: { onNewSession: () => void }) {
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
      }}
    >
      <div
        style={{
          fontSize: "48px",
          fontWeight: "bold",
          color: "#2a2a2a",
          letterSpacing: "4px",
        }}
      >
        GRIDCODE
      </div>
      <div style={{ fontSize: "12px", color: "#555555" }}>
        Bloomberg Terminal for Claude Code
      </div>
      <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
        <button
          onClick={onNewSession}
          style={{
            background: "#ff8c00",
            border: "none",
            color: "#0a0a0a",
            fontSize: "12px",
            fontFamily: "'SF Mono', monospace",
            cursor: "pointer",
            padding: "10px 24px",
            fontWeight: "bold",
            letterSpacing: "1px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#ffa040")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#ff8c00")}
        >
          NEW SESSION
        </button>
        <div style={{ fontSize: "10px", color: "#555555", marginTop: "4px" }}>
          or press Cmd+N
        </div>
      </div>
      <div
        style={{
          marginTop: "32px",
          fontSize: "10px",
          color: "#333333",
          display: "grid",
          gridTemplateColumns: "auto auto",
          gap: "4px 16px",
        }}
      >
        <span style={{ color: "#555555" }}>Cmd+K</span><span>Command Palette</span>
        <span style={{ color: "#555555" }}>Cmd+B</span><span>Broadcast Mode</span>
        <span style={{ color: "#555555" }}>Cmd+Enter</span><span>Maximize Pane</span>
        <span style={{ color: "#555555" }}>Cmd+Arrow</span><span>Navigate Grid</span>
      </div>
    </div>
  );
}
