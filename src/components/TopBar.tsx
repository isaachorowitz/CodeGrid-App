import { memo, useCallback, useState } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSessionStore } from "../stores/sessionStore";
import { useLayoutStore, type PresetLayout } from "../stores/layoutStore";
import { createWorkspace, renameWorkspace as renameWorkspaceIpc } from "../lib/ipc";

export const TopBar = memo(function TopBar() {
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    addWorkspace,
    setNewSessionDialogOpen,
    setCommandPaletteOpen,
  } = useWorkspaceStore();
  const sessions = useSessionStore((s) => s.sessions);
  const broadcastMode = useSessionStore((s) => s.broadcastMode);
  const toggleBroadcast = useSessionStore((s) => s.toggleBroadcast);
  const applyPreset = useLayoutStore((s) => s.applyPreset);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleNewWorkspace = useCallback(async () => {
    const name = `Workspace ${workspaces.length + 1}`;
    try {
      const ws = await createWorkspace(name);
      addWorkspace(ws);
    } catch (e) {
      console.error("Failed to create workspace:", e);
    }
  }, [workspaces.length, addWorkspace]);

  const handlePreset = useCallback(
    (preset: PresetLayout) => {
      const ids = sessions.map((s) => s.id);
      applyPreset(preset, ids);
    },
    [sessions, applyPreset],
  );

  const handleRenameStart = useCallback(
    (id: string, currentName: string) => {
      setEditingId(id);
      setEditName(currentName);
    },
    [],
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
    { label: "1x1", value: "1x1" },
    { label: "2x2", value: "2x2" },
    { label: "3x3", value: "3x3" },
    { label: "1+2", value: "1+2" },
    { label: "1+3", value: "1+3" },
  ];

  return (
    <div
      style={{
        height: "32px",
        display: "flex",
        alignItems: "center",
        background: "#141414",
        borderBottom: "1px solid #2a2a2a",
        padding: "0 8px",
        gap: "2px",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          fontFamily: "'SF Mono', 'Menlo', monospace",
          fontSize: "12px",
          fontWeight: "bold",
          color: "#ff8c00",
          marginRight: "12px",
          letterSpacing: "1px",
        }}
      >
        GRIDCODE
      </div>

      {/* Workspace tabs */}
      <div style={{ display: "flex", gap: "1px", flex: 1 }}>
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            onClick={() => setActiveWorkspace(ws.id)}
            onDoubleClick={() => handleRenameStart(ws.id, ws.name)}
            style={{
              padding: "4px 12px",
              fontSize: "11px",
              fontFamily: "'SF Mono', 'Menlo', monospace",
              color:
                ws.id === activeWorkspaceId ? "#ff8c00" : "#888888",
              background:
                ws.id === activeWorkspaceId ? "#1e1e1e" : "transparent",
              borderBottom:
                ws.id === activeWorkspaceId
                  ? "2px solid #ff8c00"
                  : "2px solid transparent",
              cursor: "pointer",
            }}
          >
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
                  background: "transparent",
                  border: "none",
                  color: "#ff8c00",
                  fontFamily: "'SF Mono', 'Menlo', monospace",
                  fontSize: "11px",
                  outline: "none",
                  width: "100px",
                  padding: 0,
                }}
              />
            ) : (
              ws.name
            )}
          </div>
        ))}
        <button
          onClick={handleNewWorkspace}
          style={{
            background: "none",
            border: "none",
            color: "#555555",
            fontSize: "14px",
            cursor: "pointer",
            padding: "4px 8px",
            fontFamily: "'SF Mono', 'Menlo', monospace",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ff8c00")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
        >
          +
        </button>
      </div>

      {/* Layout presets */}
      <div
        style={{
          display: "flex",
          gap: "2px",
          marginRight: "8px",
        }}
      >
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => handlePreset(p.value)}
            style={{
              background: "#1e1e1e",
              border: "1px solid #2a2a2a",
              color: "#888888",
              fontSize: "10px",
              fontFamily: "'SF Mono', 'Menlo', monospace",
              cursor: "pointer",
              padding: "2px 6px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#ff8c00";
              e.currentTarget.style.borderColor = "#ff8c00";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#888888";
              e.currentTarget.style.borderColor = "#2a2a2a";
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Broadcast toggle */}
      <button
        onClick={toggleBroadcast}
        style={{
          background: broadcastMode ? "rgba(255, 140, 0, 0.2)" : "#1e1e1e",
          border: `1px solid ${broadcastMode ? "#ff8c00" : "#2a2a2a"}`,
          color: broadcastMode ? "#ff8c00" : "#555555",
          fontSize: "10px",
          fontFamily: "'SF Mono', 'Menlo', monospace",
          cursor: "pointer",
          padding: "2px 8px",
          marginRight: "4px",
          letterSpacing: "0.5px",
        }}
      >
        BCAST
      </button>

      {/* New session button */}
      <button
        onClick={() => setNewSessionDialogOpen(true)}
        style={{
          background: "#1e1e1e",
          border: "1px solid #2a2a2a",
          color: "#888888",
          fontSize: "10px",
          fontFamily: "'SF Mono', 'Menlo', monospace",
          cursor: "pointer",
          padding: "2px 8px",
          marginRight: "4px",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#ff8c00";
          e.currentTarget.style.borderColor = "#ff8c00";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#888888";
          e.currentTarget.style.borderColor = "#2a2a2a";
        }}
      >
        + NEW
      </button>

      {/* Command palette trigger */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        style={{
          background: "#1e1e1e",
          border: "1px solid #2a2a2a",
          color: "#555555",
          fontSize: "10px",
          fontFamily: "'SF Mono', 'Menlo', monospace",
          cursor: "pointer",
          padding: "2px 8px",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#ff8c00";
          e.currentTarget.style.borderColor = "#ff8c00";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#555555";
          e.currentTarget.style.borderColor = "#2a2a2a";
        }}
      >
        CMD+K
      </button>
    </div>
  );
});
