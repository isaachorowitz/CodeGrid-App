import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Canvas } from "./components/Canvas";
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
import { TrialBanner } from "./components/TrialBanner";
import { LicenseDialog } from "./components/LicenseDialog";
import { useSessionStore } from "./stores/sessionStore";
import { sanitizeLayouts, sanitizeCanvasState, useLayoutStore } from "./stores/layoutStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useAppStore } from "./stores/appStore";
import { useToastStore } from "./stores/toastStore";
import { useLicenseStore } from "./stores/licenseStore";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import {
  createSession,
  killSession,
  createWorkspace,
  createWorkspaceWithRepo,
  getWorkspaces,
  saveLayout as saveLayoutIpc,
  spawnShellSession,
  setActiveWorkspace as setActiveWorkspaceIpc,
  listRecentDirs,
  detectClaudeSkills,
  getAvailableModels,
  checkGitSetup,
  createProjectDir,
  sendToSession,
  getSetting,
  getPersistedSessions,
} from "./lib/ipc";

export default function App() {
  const {
    sessions: allSessions,
    addSession,
    removeSession,
    setFocusedSession,
  } = useSessionStore();
  const { layouts, canvas, addPaneLayout, removePaneLayout, setLayouts, setCanvas } = useLayoutStore();
  const {
    workspaces,
    activeWorkspaceId,
    setWorkspaces,
    addWorkspace,
    setActiveWorkspace,
    updateWorkspace,
    sidebarOpen,
    activePanel,
    setNewSessionDialogOpen,
    setVibeMode,
  } = useWorkspaceStore();
  const { setSkills, setModels, setRecentDirs, setGitSetupWizardOpen } = useAppStore();
  const addToast = useToastStore((s) => s.addToast);
  const attentionCooldownRef = useRef<Record<string, number>>({});

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
      let isFirstLaunch = false;
      try {
        const existing = await getWorkspaces();
        isFirstLaunch = existing.length === 0;
        if (existing.length > 0) {
          setWorkspaces(existing);
          const active = existing.find((w) => w.is_active) ?? existing[0];
          setActiveWorkspace(active.id);
          if (active.layout_json) {
            try {
              const parsed = JSON.parse(active.layout_json);
              if (parsed && typeof parsed === "object" && Array.isArray(parsed.layouts)) {
                setLayouts(sanitizeLayouts(parsed.layouts, dimensions.width, dimensions.height));
                setCanvas(parsed.canvas ? sanitizeCanvasState(parsed.canvas) : sanitizeCanvasState(null));
              } else {
                // Legacy format: just an array of layouts
                setLayouts(sanitizeLayouts(parsed, dimensions.width, dimensions.height));
                setCanvas(sanitizeCanvasState(null));
              }
            } catch (e) {
              console.warn("Failed to parse layout JSON:", e);
              setLayouts([]);
              setCanvas(sanitizeCanvasState(null));
            }
          } else {
            setCanvas(sanitizeCanvasState(null));
          }

          // Restore persisted sessions (as dead) for ALL workspaces so switching
          // workspaces shows the correct pane titles and layout placeholders.
          try {
            for (const ws of existing) {
              const saved = await getPersistedSessions(ws.id);
              for (const s of saved) {
                // Only add if not already in memory (avoid duplicates on hot-reload)
                const { sessions: current } = useSessionStore.getState();
                if (!current.some((c) => c.id === s.id)) {
                  useSessionStore.getState().addSession(s);
                }
              }
            }
          } catch (e) { console.warn("Failed to restore sessions:", e); }
        } else {
          const ws = await createWorkspace("Default");
          addWorkspace(ws);
          try { await setActiveWorkspaceIpc(ws.id); } catch {}
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
      try { const skills = await detectClaudeSkills(); setSkills(skills); } catch (e) { console.warn("Failed to load skills:", e); }

      // Load models
      try { const models = await getAvailableModels(); setModels(models); } catch (e) { console.warn("Failed to load models:", e); }

      // Load recent dirs
      try { const dirs = await listRecentDirs(); setRecentDirs(dirs); } catch (e) { console.warn("Failed to load recent dirs:", e); }

      // Load vibe mode setting
      try { const vm = await getSetting("vibeMode"); if (vm === "true") setVibeMode(true); } catch (e) { console.warn("Failed to load vibe mode:", e); }

      // Load license status
      try { await useLicenseStore.getState().fetchStatus(); } catch (e) { console.warn("Failed to load license status:", e); }

      // Show Git Setup Wizard on first launch (no workspaces existed) OR if not fully configured
      try {
        const gitStatus = await checkGitSetup();
        if (isFirstLaunch || !gitStatus.gh_authenticated) {
          setGitSetupWizardOpen(true);
        }
      } catch (e) { console.warn("Failed to check git setup:", e); }
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
    const layoutJson = JSON.stringify({ layouts, canvas });
    // Keep workspace store in sync so workspace switching can read current layout
    updateWorkspace(activeWorkspaceId, { layout_json: layoutJson });
    const timer = setTimeout(() => {
      saveLayoutIpc(activeWorkspaceId, layoutJson).catch(() => {});
    }, 1000);
    return () => {
      clearTimeout(timer);
      // Best-effort flush on workspace switch/unmount so we don't lose the latest drag/resize.
      saveLayoutIpc(activeWorkspaceId, layoutJson).catch(() => {});
    };
  }, [layouts, canvas, activeWorkspaceId, updateWorkspace]);

  // Broadcast input routing (only to sessions in the active workspace)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      for (const session of sessions) {
        window.dispatchEvent(new CustomEvent("codegrid:broadcast-write", { detail: { sessionId: session.id, data: detail.data } }));
      }
    };
    window.addEventListener("codegrid:broadcast-input", handler);
    return () => window.removeEventListener("codegrid:broadcast-input", handler);
  }, [sessions]);

  // Cross-terminal attention toasts (approval/input requests).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ sessionId?: string; reason?: string }>).detail;
      if (!detail?.sessionId || !detail.reason) return;

      const now = Date.now();
      const last = attentionCooldownRef.current[detail.sessionId] ?? 0;
      if (now - last < 12000) return;
      attentionCooldownRef.current[detail.sessionId] = now;

      const all = useSessionStore.getState().sessions;
      const target = all.find((s) => s.id === detail.sessionId);
      const pane = target ? `[${target.pane_number}]` : `#${detail.sessionId.slice(0, 6)}`;
      addToast(`${pane} ${detail.reason}`, "warning", 7000);
    };

    window.addEventListener("codegrid:session-attention", handler);
    return () => window.removeEventListener("codegrid:session-attention", handler);
  }, [addToast]);

  // New workspace events
  useEffect(() => {
    const handler = async () => {
      try {
        const ws = await createWorkspace(`Workspace ${workspaces.length + 1}`);
        addWorkspace(ws);
        try { await setActiveWorkspaceIpc(ws.id); } catch {}
      } catch (e) { addToast(`Failed to create workspace: ${e}`, "error"); }
    };
    window.addEventListener("codegrid:new-workspace", handler);
    return () => window.removeEventListener("codegrid:new-workspace", handler);
  }, [workspaces.length, addWorkspace, addToast]);

  // New workspace with repo event
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      try {
        const ws = await createWorkspaceWithRepo(detail.name, detail.repoPath);
        addWorkspace(ws);
        try { await setActiveWorkspaceIpc(ws.id); } catch {}
        addToast(`Workspace "${ws.name}" created`, "success");
      } catch (err) {
        addToast(`Failed to create workspace: ${err}`, "error");
      }
    };
    window.addEventListener("codegrid:new-workspace-with-repo", handler);
    return () => window.removeEventListener("codegrid:new-workspace-with-repo", handler);
  }, [addWorkspace, addToast]);

  const handleCreateSession = useCallback(
    async (workingDir: string, useWorktree: boolean, resume: boolean, isShell: boolean) => {
      if (!activeWorkspaceId) return;

      const licenseStatus = useLicenseStore.getState().status;
      const maxPanes = licenseStatus?.max_panes ?? 2;
      const currentCount = useSessionStore.getState().getWorkspaceSessionCount(activeWorkspaceId);
      if (currentCount >= maxPanes) {
        if (licenseStatus?.license_type === "trial") {
          addToast(`Trial limited to ${maxPanes} panes. Upgrade to unlock unlimited panes.`, "error");
        } else {
          addToast(`License limit reached (${maxPanes} panes). Please upgrade your license.`, "error");
        }
        useWorkspaceStore.getState().setLicenseDialogOpen(true);
        return;
      }

      try {
        let session;
        if (isShell) {
          session = await spawnShellSession(workingDir, activeWorkspaceId);
        } else {
          session = await createSession(workingDir, activeWorkspaceId, useWorktree, resume);
        }
        addSession(session);
        addPaneLayout(session.id);
        setFocusedSession(session.id);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("codegrid:focus-terminal", { detail: { sessionId: session.id } }));
        }, 200);
      } catch (e) {
        addToast(`Failed to create session: ${e}`, "error");
      }
    },
    [activeWorkspaceId, addSession, addPaneLayout, setFocusedSession, addToast],
  );

  // Quick session from Hub
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      handleCreateSession(detail.path, false, false, detail.type === "shell");
    };
    window.addEventListener("codegrid:quick-session", handler);
    return () => window.removeEventListener("codegrid:quick-session", handler);
  }, [handleCreateSession]);

  // Restart a dead/restored session — replaces the dead entry with a live one
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        sessionId: string; workingDir: string; workspaceId: string;
        isShell: boolean; resume: boolean;
      };
      try {
        // Capture the dead session's name and layout position before removing it
        const deadSession = useSessionStore.getState().sessions.find((s) => s.id === detail.sessionId);
        const savedName = deadSession?.manualName ?? deadSession?.name ?? undefined;
        const oldLayout = useLayoutStore.getState().layouts.find((l) => l.i === detail.sessionId);

        // Remove dead session
        try { await killSession(detail.sessionId); } catch { /* already dead */ }
        removeSession(detail.sessionId);

        // Create new live session in the same workspace
        const session = detail.isShell
          ? await spawnShellSession(detail.workingDir, detail.workspaceId)
          : await createSession(detail.workingDir, detail.workspaceId, false, detail.resume);

        addSession(session);
        // Swap the layout ID in-place to avoid layout shifts from remove+add
        if (oldLayout) {
          useLayoutStore.getState().setLayouts(
            useLayoutStore.getState().layouts.map((l) =>
              l.i === detail.sessionId ? { ...l, i: session.id } : l,
            ),
          );
        } else {
          removePaneLayout(detail.sessionId);
          addPaneLayout(session.id);
        }
        setFocusedSession(session.id);

        // Restore the custom name if it had one
        if (savedName) {
          useSessionStore.getState().setSessionManualName(session.id, savedName);
          import("./lib/ipc").then(({ renameSession }) =>
            renameSession(session.id, savedName).catch(() => {})
          );
        }

        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("codegrid:focus-terminal", { detail: { sessionId: session.id } }));
        }, 200);
      } catch (err) {
        addToast(`Failed to restart session: ${err}`, "error");
      }
    };
    window.addEventListener("codegrid:restart-session", handler);
    return () => window.removeEventListener("codegrid:restart-session", handler);
  }, [addSession, addPaneLayout, setFocusedSession, removeSession, removePaneLayout, addToast]);

  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      // Optimistically remove from UI first for instant feedback
      removeSession(sessionId);
      removePaneLayout(sessionId);
      // Then kill the PTY in the background
      try { await killSession(sessionId); } catch (e) { console.warn("Failed to kill session:", e); }
    },
    [removeSession, removePaneLayout],
  );

  // Close session events (must be after handleCloseSession declaration)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      handleCloseSession(detail.sessionId);
    };
    window.addEventListener("codegrid:close-session", handler);
    return () => window.removeEventListener("codegrid:close-session", handler);
  }, [handleCloseSession]);

  const handleFocusSession = useCallback(
    (sessionId: string) => {
      setFocusedSession(sessionId);
      window.dispatchEvent(new CustomEvent("codegrid:focus-terminal", { detail: { sessionId } }));
    },
    [setFocusedSession],
  );

  const gridWidth = dimensions.width;
  const gridHeight = dimensions.height;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        backgroundColor: "#0a0a0a",
        backgroundImage: "radial-gradient(circle, #202020 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        padding: "10px",
        gap: "10px",
        boxSizing: "border-box",
      }}
    >
      <TrialBanner />
      <TopBar onFocusSession={handleFocusSession} onCloseSession={handleCloseSession} />
      <div style={{ display: "flex", flex: 1, overflow: "hidden", gap: "10px", minHeight: 0 }}>
        <Sidebar />
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflow: "hidden",
            position: "relative",
            minHeight: 0,
            borderRadius: "14px",
            border: "1px solid #2a2a2a",
            background: "rgba(12, 12, 12, 0.88)",
            boxShadow: "0 14px 36px rgba(0, 0, 0, 0.4)",
          }}
        >
          {sessions.length === 0 ? (
            <EmptyState
              onNewSession={() => setNewSessionDialogOpen(true)}
              onCreateSession={handleCreateSession}
            />
          ) : (
            <Canvas width={gridWidth} height={gridHeight} onCloseSession={handleCloseSession} />
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
      <LicenseDialog />
      <ToastContainer />
    </div>
  );
}

const VIBE_QUICK_CARDS = [
  { label: "Web App", icon: "\u{1F310}", prompt: "Build me a modern web application with a clean UI. Include routing, a navigation bar, and a responsive layout. Use React with TypeScript." },
  { label: "Mobile App", icon: "\u{1F4F1}", prompt: "Build me a mobile app using React Native with Expo. Include navigation, a home screen, and a settings page." },
  { label: "API", icon: "\u{26A1}", prompt: "Build me a REST API with Node.js and Express. Include authentication, CRUD endpoints, and a database connection." },
  { label: "Landing Page", icon: "\u{1F3AF}", prompt: "Build me a beautiful landing page with a hero section, features grid, testimonials, and a call-to-action. Make it responsive and modern." },
  { label: "Chrome Extension", icon: "\u{1F9E9}", prompt: "Build me a Chrome extension with a popup UI, background script, and content script. Include a manifest.json for Manifest V3." },
];

const GLOW_KEYFRAMES = `
@keyframes inputGlow {
  0% { box-shadow: 0 0 5px rgba(255, 140, 0, 0.1), inset 0 0 5px rgba(255, 140, 0, 0.05); }
  50% { box-shadow: 0 0 15px rgba(255, 140, 0, 0.25), inset 0 0 8px rgba(255, 140, 0, 0.1); }
  100% { box-shadow: 0 0 5px rgba(255, 140, 0, 0.1), inset 0 0 5px rgba(255, 140, 0, 0.05); }
}
`;

interface EmptyStateProps {
  onNewSession: () => void;
  onCreateSession: (workingDir: string, useWorktree: boolean, resume: boolean, isShell: boolean) => Promise<void>;
}

function EmptyState({ onNewSession, onCreateSession }: EmptyStateProps) {
  const { setHubBrowserOpen, setSkillsPanelOpen, recentDirs } = useAppStore();
  const { vibeMode, activeWorkspaceId } = useWorkspaceStore();
  const addToast = useToastStore((s) => s.addToast);
  const addSession = useSessionStore((s) => s.addSession);
  const addPaneLayout = useLayoutStore((s) => s.addPaneLayout);
  const setFocusedSession = useSessionStore((s) => s.setFocusedSession);

  const [ideaText, setIdeaText] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const ideaInputRef = useRef<HTMLTextAreaElement>(null);

  const handleQuickOpen = (dir: string) => {
    window.dispatchEvent(new CustomEvent("codegrid:quick-session", { detail: { path: dir, type: "claude" } }));
  };

  const handleCreateWorkspaceFromRepo = (dir: string) => {
    const name = dir.split("/").pop() ?? "Workspace";
    window.dispatchEvent(new CustomEvent("codegrid:new-workspace-with-repo", { detail: { name, repoPath: dir } }));
  };

  const handleOpenFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false, title: "Open a project folder" });
      if (selected) {
        window.dispatchEvent(new CustomEvent("codegrid:quick-session", { detail: { path: selected, type: "claude" } }));
      }
    } catch (e) {
      addToast(`Failed to open folder picker: ${e}`, "error");
    }
  };

  const handleStartBuilding = async () => {
    const text = ideaText.trim();
    if (!text || !activeWorkspaceId) return;

    setIsCreating(true);
    try {
      // 1. Create the project directory
      const projectPath = await createProjectDir(text);

      // 2. Create a workspace for the project
      const projectName = projectPath.split("/").pop() ?? "project";
      const ws = await createWorkspaceWithRepo(projectName, projectPath);
      useWorkspaceStore.getState().addWorkspace(ws);

      // 3. Create a Claude Code session in that directory
      const session = await createSession(projectPath, ws.id, false, false);
      addSession(session);
      addPaneLayout(session.id);
      setFocusedSession(session.id);

      // 4. Send the user's description as the first prompt after a short delay
      setTimeout(async () => {
        try {
          await sendToSession(session.id, text);
        } catch (e) {
          console.warn("Failed to send initial prompt:", e);
        }
        window.dispatchEvent(new CustomEvent("codegrid:focus-terminal", { detail: { sessionId: session.id } }));
      }, 1500);
    } catch (e) {
      addToast(`Failed to create project: ${e}`, "error");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCardClick = (prompt: string) => {
    setIdeaText(prompt);
    setTimeout(() => ideaInputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ideaText.trim()) {
      e.preventDefault();
      handleStartBuilding();
    }
  };

  const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";

  // === VIBE MODE EMPTY STATE ===
  if (vibeMode) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          fontFamily: MONO,
          color: "#e0e0e0",
          padding: "40px 24px",
          overflowY: "auto",
        }}
      >
        <style>{GLOW_KEYFRAMES}</style>

        {/* Heading */}
        <div style={{ fontSize: "28px", fontWeight: "bold", color: "#e0e0e0", letterSpacing: "1px", marginBottom: "4px" }}>
          What do you want to build?
        </div>
        <div style={{ fontSize: "13px", color: "#666666", marginBottom: "28px" }}>
          Describe your idea and let AI handle the rest
        </div>

        {/* Main input */}
        <div style={{ width: "100%", maxWidth: "560px", marginBottom: "12px" }}>
          <textarea
            ref={ideaInputRef}
            value={ideaText}
            onChange={(e) => setIdeaText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your idea..."
            rows={3}
            style={{
              width: "100%",
              background: "#111111",
              border: "1px solid #333333",
              borderRadius: "8px",
              color: "#e0e0e0",
              fontSize: "15px",
              fontFamily: MONO,
              padding: "16px 18px",
              resize: "none",
              outline: "none",
              animation: "inputGlow 3s ease-in-out infinite",
              transition: "border-color 0.2s",
              boxSizing: "border-box",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#333333"; }}
          />
        </div>

        {/* Start Building button */}
        <button
          onClick={handleStartBuilding}
          disabled={!ideaText.trim() || isCreating}
          style={{
            background: ideaText.trim() ? "#ff8c00" : "#2a2a2a",
            border: "none",
            borderRadius: "6px",
            color: ideaText.trim() ? "#0a0a0a" : "#555555",
            fontSize: "14px",
            fontFamily: MONO,
            fontWeight: "bold",
            letterSpacing: "1px",
            padding: "12px 32px",
            cursor: ideaText.trim() && !isCreating ? "pointer" : "default",
            transition: "all 0.2s",
            marginBottom: "24px",
            opacity: isCreating ? 0.7 : 1,
          }}
          onMouseEnter={(e) => { if (ideaText.trim() && !isCreating) e.currentTarget.style.background = "#ffa040"; }}
          onMouseLeave={(e) => { if (ideaText.trim()) e.currentTarget.style.background = "#ff8c00"; }}
        >
          {isCreating ? "CREATING..." : "START BUILDING \u2192"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", maxWidth: "560px", marginBottom: "20px" }}>
          <div style={{ flex: 1, height: "1px", background: "#2a2a2a" }} />
          <span style={{ fontSize: "11px", color: "#555555" }}>or</span>
          <div style={{ flex: 1, height: "1px", background: "#2a2a2a" }} />
        </div>

        {/* Open Project / From GitHub buttons */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "28px" }}>
          <button
            onClick={handleOpenFolder}
            style={{
              background: "#141414",
              border: "1px solid #2a2a2a",
              borderRadius: "6px",
              color: "#e0e0e0",
              fontSize: "12px",
              fontFamily: MONO,
              padding: "10px 20px",
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; e.currentTarget.style.background = "#1e1e1e"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.background = "#141414"; }}
          >
            <span style={{ fontSize: "14px" }}>{"\uD83D\uDCC2"}</span> Open Project
          </button>
          <button
            onClick={() => setHubBrowserOpen(true)}
            style={{
              background: "#141414",
              border: "1px solid #2a2a2a",
              borderRadius: "6px",
              color: "#e0e0e0",
              fontSize: "12px",
              fontFamily: MONO,
              padding: "10px 20px",
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; e.currentTarget.style.background = "#1e1e1e"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.background = "#141414"; }}
          >
            <span style={{ fontSize: "14px" }}>{"\uD83D\uDD17"}</span> From GitHub
          </button>
        </div>

        {/* Quick-start cards */}
        <div style={{ width: "100%", maxWidth: "560px", marginBottom: "24px" }}>
          <div style={{ fontSize: "10px", color: "#555555", letterSpacing: "1px", marginBottom: "8px", fontWeight: "bold" }}>
            QUICK START
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {VIBE_QUICK_CARDS.map((card) => (
              <button
                key={card.label}
                onClick={() => handleCardClick(card.prompt)}
                style={{
                  background: "#111111",
                  border: "1px solid #2a2a2a",
                  borderRadius: "6px",
                  color: "#c0c0c0",
                  fontSize: "11px",
                  fontFamily: MONO,
                  padding: "8px 14px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#ff8c00";
                  e.currentTarget.style.background = "#1a1a1a";
                  e.currentTarget.style.color = "#ff8c00";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#2a2a2a";
                  e.currentTarget.style.background = "#111111";
                  e.currentTarget.style.color = "#c0c0c0";
                }}
              >
                <span style={{ fontSize: "13px" }}>{card.icon}</span>
                {card.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent projects */}
        {recentDirs.length > 0 && (
          <div style={{ width: "100%", maxWidth: "560px" }}>
            <div style={{ fontSize: "10px", color: "#555555", letterSpacing: "1px", marginBottom: "8px", fontWeight: "bold" }}>
              RECENT
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {recentDirs.slice(0, 5).map((dir) => (
                <button
                  key={dir}
                  onClick={() => handleQuickOpen(dir)}
                  style={{
                    background: "transparent",
                    border: "1px solid transparent",
                    borderRadius: "4px",
                    color: "#999999",
                    fontSize: "12px",
                    fontFamily: MONO,
                    padding: "6px 10px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#141414"; e.currentTarget.style.color = "#e0e0e0"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#999999"; e.currentTarget.style.borderColor = "transparent"; }}
                >
                  <span style={{ color: "#ff8c00", fontWeight: "bold", fontSize: "12px", width: "18px", textAlign: "center" }}>
                    {(dir.split("/").pop() || "?")[0]?.toUpperCase()}
                  </span>
                  <span style={{ fontWeight: "bold", color: "inherit" }}>{dir.split("/").pop()}</span>
                  <span style={{ color: "#444444", fontSize: "10px", marginLeft: "auto" }}>
                    {dir.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // === STANDARD EMPTY STATE (vibeMode OFF) ===
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        fontFamily: MONO,
        color: "#555555",
        gap: "16px",
        padding: "40px",
      }}
    >
      {/* Logo */}
      <div style={{ fontSize: "48px", fontWeight: "bold", color: "#2a2a2a", letterSpacing: "4px" }}>
        CODEGRID
      </div>
      <div style={{ fontSize: "12px", color: "#666666", marginBottom: "8px" }}>
        Your AI-powered terminal workspace
      </div>

      {/* Big action buttons */}
      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
        <button
          onClick={onNewSession}
          style={{
            background: "#ff8c00", border: "none", color: "#0a0a0a",
            fontSize: "13px", fontFamily: MONO, cursor: "pointer",
            padding: "14px 28px", fontWeight: "bold", letterSpacing: "1px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#ffa040")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#ff8c00")}
        >
          START A NEW SESSION
        </button>
        <button
          onClick={() => setHubBrowserOpen(true)}
          style={{
            background: "#1e1e1e", border: "1px solid #00c853", color: "#00c853",
            fontSize: "13px", fontFamily: MONO, cursor: "pointer",
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
            fontSize: "13px", fontFamily: MONO, cursor: "pointer",
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
                  fontSize: "11px", fontFamily: MONO, cursor: "pointer",
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
