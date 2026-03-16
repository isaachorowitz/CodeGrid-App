import { memo, useCallback, useState } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSessionStore } from "../stores/sessionStore";
import { useLayoutStore, type PresetLayout } from "../stores/layoutStore";
import { useAppStore } from "../stores/appStore";
import { ModelSwitcher } from "./ModelSwitcher";
import { QuickActions } from "./QuickActions";
import { createWorkspace, createWorkspaceWithRepo, renameWorkspace as renameWorkspaceIpc, setActiveWorkspace as setActiveWorkspaceIpc } from "../lib/ipc";
import { useToastStore } from "../stores/toastStore";

export const TopBar = memo(function TopBar() {
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    addWorkspace,
    setNewSessionDialogOpen,
    setCommandPaletteOpen,
    toggleSidebar,
    sidebarOpen,
  } = useWorkspaceStore();
  const sessions = useSessionStore((s) => s.sessions);
  const broadcastMode = useSessionStore((s) => s.broadcastMode);
  const toggleBroadcast = useSessionStore((s) => s.toggleBroadcast);
  const applyPreset = useLayoutStore((s) => s.applyPreset);
  const { setSkillsPanelOpen, setHubBrowserOpen, setGitManagerOpen, setMcpManagerOpen, setClaudeMdEditorOpen } = useAppStore();
  const addToast = useToastStore((s) => s.addToast);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const handleNewWorkspace = useCallback(async () => {
    const name = `Workspace ${workspaces.length + 1}`;
    try {
      const ws = await createWorkspace(name);
      addWorkspace(ws);
    } catch (e) {
      console.error("Failed to create workspace:", e);
    }
  }, [workspaces.length, addWorkspace]);

  const handleSwitchWorkspace = useCallback(async (wsId: string) => {
    setActiveWorkspace(wsId);
    try { await setActiveWorkspaceIpc(wsId); } catch {}
  }, [setActiveWorkspace]);

  const handlePreset = useCallback(
    (preset: PresetLayout) => {
      const ids = sessions.map((s) => s.id);
      applyPreset(preset, ids);
    },
    [sessions, applyPreset],
  );

  const handleRenameEnd = useCallback(
    async (id: string) => {
      if (editName.trim()) {
        try {
          await renameWorkspaceIpc(id, editName.trim());
          useWorkspaceStore.getState().updateWorkspace(id, { name: editName.trim() });
        } catch (e) {
          console.error("Failed to rename workspace:", e);
        }
      }
      setEditingId(null);
    },
    [editName],
  );

  const presets: { label: string; value: PresetLayout }[] = [
    { label: "1", value: "1x1" },
    { label: "4", value: "2x2" },
    { label: "9", value: "3x3" },
    { label: "1+2", value: "1+2" },
    { label: "1+3", value: "1+3" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#141414",
        borderBottom: "1px solid #2a2a2a",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {/* Main bar */}
      <div
        style={{
          height: "32px",
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          gap: "4px",
        }}
      >
        {/* Toggle sidebar */}
        <button
          onClick={() => toggleSidebar()}
          title="Toggle Sidebar (Cmd+S)"
          style={{
            background: "none", border: "none",
            color: sidebarOpen ? "#ff8c00" : "#555555",
            fontSize: "14px", cursor: "pointer", padding: "4px 6px",
            fontFamily: "'SF Mono', monospace",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ff8c00")}
          onMouseLeave={(e) => (e.currentTarget.style.color = sidebarOpen ? "#ff8c00" : "#555555")}
        >
          {sidebarOpen ? "«" : "»"}
        </button>

        {/* Logo */}
        <div
          style={{
            fontFamily: "'SF Mono', 'Menlo', monospace",
            fontSize: "12px",
            fontWeight: "bold",
            color: "#ff8c00",
            marginRight: "8px",
            letterSpacing: "1px",
          }}
        >
          GRIDCODE
        </div>

        {/* Workspace tabs */}
        <div style={{ display: "flex", gap: "1px", flex: 1, overflow: "hidden" }}>
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              onClick={() => handleSwitchWorkspace(ws.id)}
              onDoubleClick={() => {
                setEditingId(ws.id);
                setEditName(ws.name);
              }}
              title={ws.repo_path ? ws.repo_path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~") : ws.name}
              style={{
                padding: "4px 12px",
                fontSize: "11px",
                fontFamily: "'SF Mono', 'Menlo', monospace",
                color: ws.id === activeWorkspaceId ? "#ff8c00" : "#888888",
                background: ws.id === activeWorkspaceId ? "#1e1e1e" : "transparent",
                borderBottom: ws.id === activeWorkspaceId ? "2px solid #ff8c00" : "2px solid transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {ws.repo_path && (
                <span style={{ color: ws.id === activeWorkspaceId ? "#d500f9" : "#555555", fontSize: "9px" }}>
                  {ws.repo_path ? "R" : ""}
                </span>
              )}
              {editingId === ws.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleRenameEnd(ws.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameEnd(ws.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  style={{
                    background: "transparent", border: "none", color: "#ff8c00",
                    fontFamily: "'SF Mono', monospace", fontSize: "11px", outline: "none",
                    width: "80px", padding: 0,
                  }}
                />
              ) : (
                ws.name
              )}
            </div>
          ))}
          <button
            onClick={handleNewWorkspace}
            title="New Workspace (Cmd+Shift+N)"
            style={{
              background: "none", border: "none", color: "#555555", fontSize: "14px",
              cursor: "pointer", padding: "4px 8px", fontFamily: "'SF Mono', monospace",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ff8c00")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
          >
            +
          </button>
        </div>

        {/* Layout presets */}
        <div style={{ display: "flex", gap: "1px", marginRight: "4px" }}>
          {presets.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePreset(p.value)}
              title={`Layout: ${p.value}`}
              style={{
                background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888888",
                fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
                padding: "2px 5px", minWidth: "22px", textAlign: "center",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#ff8c00"; e.currentTarget.style.borderColor = "#ff8c00"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#888888"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Broadcast */}
        <button
          onClick={toggleBroadcast}
          title="Broadcast Mode — type once, send to all panes (Cmd+B)"
          style={{
            background: broadcastMode ? "rgba(255, 140, 0, 0.2)" : "#1e1e1e",
            border: `1px solid ${broadcastMode ? "#ff8c00" : "#2a2a2a"}`,
            color: broadcastMode ? "#ff8c00" : "#555555",
            fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
            padding: "2px 6px", marginRight: "2px", letterSpacing: "0.5px",
          }}
        >
          BCAST
        </button>

        {/* New session */}
        <button
          onClick={() => setNewSessionDialogOpen(true)}
          title="New Session (Cmd+N)"
          style={{
            background: "#ff8c00", border: "1px solid #ff8c00", color: "#0a0a0a",
            fontSize: "10px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
            padding: "2px 8px", fontWeight: "bold",
          }}
        >
          + NEW
        </button>

        {/* Command palette */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          title="Command Palette (Cmd+K)"
          style={{
            background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#555555",
            fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
            padding: "2px 6px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ff8c00"; e.currentTarget.style.borderColor = "#ff8c00"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#555555"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
        >
          CMD+K
        </button>
      </div>

      {/* Secondary bar: model switcher + quick actions */}
      <div
        style={{
          height: "26px",
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          gap: "12px",
          borderTop: "1px solid #1e1e1e",
          background: "#0f0f0f",
        }}
      >
        <ModelSwitcher />
        <div style={{ width: "1px", height: "14px", background: "#2a2a2a" }} />
        <QuickActions />
      </div>
    </div>
  );
});
