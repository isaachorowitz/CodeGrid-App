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
import { DependencyGraph } from "./components/DependencyGraph";
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
  getSetting,
  getPersistedSessions,
  clearPersistedSessions,
  createBrowserPane,
  closeBrowserPane,
} from "./lib/ipc";
import { canvasToWindow, BROWSER_HEADER_HEIGHT } from "./lib/canvasToWindow";
import { getBrowserPaneWebviewBounds } from "./lib/browserPaneWebviewBounds";

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
  } = useWorkspaceStore();
  const { setSkills, setModels, setRecentDirs, setGitSetupWizardOpen } = useAppStore();
  const addToast = useToastStore((s) => s.addToast);
  const attentionCooldownRef = useRef<Record<string, number>>({});
  const closingBrowserPaneIdsRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  // Sessions for the active workspace (used by broadcast routing, etc.)
  const sessions = useMemo(
    () => allSessions.filter((s) => s.workspace_id === activeWorkspaceId),
    [allSessions, activeWorkspaceId],
  );

  useKeyboardNav();

  // Initialize app: workspace, skills, models, recent dirs
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
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

          // Restore persisted sessions from previous launch
          try {
            const persisted = await getPersistedSessions(active.id);
            if (persisted.length > 0) {
              console.log(`[CodeGrid] Restoring ${persisted.length} persisted session(s)`);
              const currentLayouts = useLayoutStore.getState().layouts;
              let updatedLayouts = [...currentLayouts];

              for (const old of persisted) {
                try {
                  // Skip browser panes — they cannot be restored (no persistent state)
                  if (old.command === "browser") {
                    console.log(`[CodeGrid] Skipping browser session ${old.id} (not restorable)`);
                    continue;
                  }
                  const isShell = !old.command.includes("claude");
                  let restored;
                  try {
                    if (isShell) {
                      restored = await spawnShellSession(old.working_dir, active.id);
                    } else {
                      restored = await createSession(old.working_dir, active.id, false, false);
                    }
                  } catch (sessionErr) {
                    addToast(`Failed to restore session for ${old.working_dir} — directory may no longer exist`, "error");
                    throw sessionErr;
                  }

                  // Carry over user-assigned name
                  if (old.name) {
                    restored.name = old.name;
                    import("./lib/ipc").then(({ renameSession }) =>
                      renameSession(restored.id, old.name).catch(() => {})
                    );
                  }

                  addSession(restored);

                  // Remap layout: swap old session ID for new one to preserve pane position
                  const layoutIdx = updatedLayouts.findIndex((l) => l.i === old.id);
                  if (layoutIdx >= 0) {
                    updatedLayouts = updatedLayouts.map((l) =>
                      l.i === old.id ? { ...l, i: restored.id } : l
                    );
                  } else {
                    addPaneLayout(restored.id);
                  }

                  console.log(`[CodeGrid] Restored session ${old.id} → ${restored.id} (${old.working_dir})`);
                } catch (e) {
                  console.warn(`[CodeGrid] Failed to restore session ${old.id}:`, e);
                }
              }

              // Apply remapped layouts
              setLayouts(updatedLayouts);

              // Clean up old DB entries so they don't restore again next launch
              const oldIds = persisted.map((s) => s.id);
              clearPersistedSessions(active.id, oldIds).catch((e) =>
                console.warn("Failed to clear old persisted sessions:", e)
              );
            }
          } catch (e) {
            console.warn("Failed to restore persisted sessions:", e);
          }
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

      // Load license status FIRST so pane limits are correct before any session creation
      try { await useLicenseStore.getState().fetchStatus(); } catch (e) { console.warn("Failed to load license status:", e); }

      // Load skills
      try { const skills = await detectClaudeSkills(); setSkills(skills); } catch (e) { console.warn("Failed to load skills:", e); }

      // Load models
      try { const models = await getAvailableModels(); setModels(models); } catch (e) { console.warn("Failed to load models:", e); }

      // Load recent dirs
      try { const dirs = await listRecentDirs(); setRecentDirs(dirs); } catch (e) { console.warn("Failed to load recent dirs:", e); }

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
      // If license hasn't loaded yet, don't block session creation
      const maxPanes = licenseStatus?.max_panes ?? 50;
      const currentCount = useSessionStore.getState().getWorkspaceSessionCount(activeWorkspaceId);
      if (licenseStatus && currentCount >= maxPanes) {
        if (licenseStatus?.is_trial) {
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

        // Auto-name workspace after the repo/folder if it has a generic name
        const ws = useWorkspaceStore.getState().workspaces.find(w => w.id === activeWorkspaceId);
        if (ws && /^(Default|Workspace \d+)$/i.test(ws.name)) {
          const folderName = workingDir.split("/").pop() ?? workingDir;
          useWorkspaceStore.getState().updateWorkspace(activeWorkspaceId, { name: folderName });
          import("./lib/ipc").then(({ renameWorkspace }) => renameWorkspace(activeWorkspaceId, folderName).catch(() => {}));
        }
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

  // New browser pane event
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!activeWorkspaceId) return;
      const url = detail?.url ?? "https://google.com";
      const browserSessionId = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      closingBrowserPaneIdsRef.current.delete(browserSessionId);

      // Create a synthetic session entry for the browser pane
      const syntheticSession = {
        id: browserSessionId,
        workspace_id: activeWorkspaceId,
        working_dir: url,
        command: "browser",
        git_branch: null,
        status: "running" as const,
        created_at: new Date().toISOString(),
        pane_number: allSessions.filter((s) => s.workspace_id === activeWorkspaceId).length + 1,
        worktree_path: null,
        name: null,
      };

      addSession(syntheticSession);
      useSessionStore.getState().updateSession(browserSessionId, { type: "browser", browserUrl: url });
      addPaneLayout(browserSessionId);
      setFocusedSession(browserSessionId);

      // Double-rAF to ensure layout is fully committed before reading position
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const layout = useLayoutStore.getState().layouts.find((l) => l.i === browserSessionId);
          if (layout) {
            // Session may have been closed before the deferred create runs.
            const stillInStore = useSessionStore
              .getState()
              .sessions
              .some((s) => s.id === browserSessionId && s.type === "browser");
            if (!stillInStore || closingBrowserPaneIdsRef.current.has(browserSessionId)) return;
            const createNativePane = (attempt: number) => {
              const measured = getBrowserPaneWebviewBounds(browserSessionId);
              if (!measured && attempt < 6) {
                requestAnimationFrame(() => createNativePane(attempt + 1));
                return;
              }

              const canvasState = useLayoutStore.getState().canvas;
              const fallback = (() => {
                // Fallback if content node still isn't available.
                const viewport = document.querySelector('[data-canvas-viewport]') as HTMLElement | null;
                const rect = viewport?.getBoundingClientRect() ?? containerRef.current?.getBoundingClientRect();
                const offsetX = rect?.left ?? 0;
                const offsetY = rect?.top ?? 0;
                const win = canvasToWindow(
                  layout.x, layout.y, layout.w, layout.h,
                  canvasState.zoom, canvasState.panX, canvasState.panY,
                  offsetX, offsetY,
                );
                const headerH = Math.round(BROWSER_HEADER_HEIGHT * canvasState.zoom);
                return { x: win.x, y: win.y + headerH, w: win.w, h: Math.max(0, win.h - headerH) };
              })();

              createBrowserPane(
                browserSessionId,
                url,
                measured?.x ?? fallback.x,
                measured?.y ?? fallback.y,
                measured?.w ?? fallback.w,
                measured?.h ?? fallback.h,
              )
                .then(async () => {
                  const wasClosed = closingBrowserPaneIdsRef.current.has(browserSessionId);
                  const stillExists = useSessionStore
                    .getState()
                    .sessions
                    .some((s) => s.id === browserSessionId && s.type === "browser");
                  if (wasClosed || !stillExists) {
                    try { await closeBrowserPane(browserSessionId); } catch {}
                  }
                  closingBrowserPaneIdsRef.current.delete(browserSessionId);
                })
                .catch((err) => {
                  closingBrowserPaneIdsRef.current.delete(browserSessionId);
                  console.warn("Failed to create browser pane:", err);
                });
            };

            createNativePane(0);
          }
        });
      });
    };
    window.addEventListener("codegrid:new-browser-pane", handler);
    return () => window.removeEventListener("codegrid:new-browser-pane", handler);
  }, [activeWorkspaceId, allSessions, addSession, addPaneLayout, setFocusedSession]);

  // Listen for JSON-RPC commands from Unix socket
  useEffect(() => {
    let unlisten1: (() => void) | undefined;
    let unlisten2: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (cancelled) return;
      unlisten1 = await listen<string>("rpc:open-folder", (e) => {
        handleCreateSession(e.payload, false, false, false);
      });
      unlisten2 = await listen<string>("rpc:new-session", (e) => {
        handleCreateSession(e.payload, false, false, false);
      });
    })();

    return () => {
      cancelled = true;
      unlisten1?.();
      unlisten2?.();
    };
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
      // Check if this is a browser pane
      const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId);
      if (session?.type === "browser") {
        closingBrowserPaneIdsRef.current.add(sessionId);
      }
      // Optimistically remove from UI first for instant feedback
      removeSession(sessionId);
      removePaneLayout(sessionId);
      // Then kill the PTY or close the browser pane in the background
      if (session?.type === "browser") {
        try { await closeBrowserPane(sessionId); } catch (e) { console.warn("Failed to close browser pane:", e); }
        finally { closingBrowserPaneIdsRef.current.delete(sessionId); }
      } else {
        try { await killSession(sessionId); } catch (e) { console.warn("Failed to kill session:", e); }
      }
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
          {sessions.length === 0 && (
            <EmptyState
              onNewSession={() => setNewSessionDialogOpen(true)}
              onCreateSession={handleCreateSession}
            />
          )}
          {allSessions.length > 0 && (
            <div style={{ position: "absolute", inset: 0, visibility: sessions.length > 0 ? "visible" : "hidden" }}>
              <Canvas width={gridWidth} height={gridHeight} onCloseSession={handleCloseSession} />
            </div>
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
      <DependencyGraph />
      <ToastContainer />
    </div>
  );
}

interface EmptyStateProps {
  onNewSession: () => void;
  onCreateSession: (workingDir: string, useWorktree: boolean, resume: boolean, isShell: boolean) => Promise<void>;
}

function EmptyState({ onNewSession, onCreateSession }: EmptyStateProps) {
  const { setHubBrowserOpen, setSkillsPanelOpen, recentDirs } = useAppStore();
  const addToast = useToastStore((s) => s.addToast);

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

  const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";

  // === EMPTY STATE ===
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

      {/* Big action button */}
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
