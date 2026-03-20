import { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSessionStore } from "../stores/sessionStore";
import { useLayoutStore, type PresetLayout } from "../stores/layoutStore";
import { useAppStore } from "../stores/appStore";
import { useToastStore } from "../stores/toastStore";
import { sendToSession } from "../lib/ipc";

interface CommandItem {
  id: string;
  label: string;
  category: string;
  /** Extra text matched by search (label stays short in the list). */
  matchText?: string;
  action: () => void;
}

export const CommandPalette = memo(function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setNewSessionDialogOpen,
    toggleSidebar,
    setSettingsOpen,
    activeWorkspaceId,
  } = useWorkspaceStore();
  const sessions = useSessionStore((s) => s.sessions);
  const { setFocusedSession, toggleBroadcast, focusedSessionId } = useSessionStore();
  const { applyPreset, toggleMaximize } = useLayoutStore();
  const { setSkillsPanelOpen, setHubBrowserOpen, setGitManagerOpen, setMcpManagerOpen, skills } = useAppStore();
  const addToast = useToastStore((s) => s.addToast);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeSessions = useMemo(
    () => sessions.filter((s) => s.workspace_id === activeWorkspaceId),
    [sessions, activeWorkspaceId],
  );

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      // Sessions
      {
        id: "new-session",
        label: "New session",
        category: "Sessions",
        action: () => { setCommandPaletteOpen(false); setNewSessionDialogOpen(true); },
      },
      // View
      {
        id: "toggle-sidebar",
        label: "Sidebar",
        category: "View",
        action: () => { setCommandPaletteOpen(false); toggleSidebar(); },
      },
      {
        id: "toggle-broadcast",
        label: "Broadcast",
        category: "View",
        action: () => { setCommandPaletteOpen(false); toggleBroadcast(); },
      },
      // Tools
      {
        id: "open-hub",
        label: "Hub",
        category: "Tools",
        action: () => { setCommandPaletteOpen(false); setHubBrowserOpen(true); },
      },
      {
        id: "open-skills",
        label: "Skills",
        category: "Tools",
        action: () => { setCommandPaletteOpen(false); setSkillsPanelOpen(true); },
      },
      {
        id: "settings",
        label: "Settings",
        category: "App",
        action: () => { setCommandPaletteOpen(false); setSettingsOpen(true); },
      },
      {
        id: "open-git",
        label: "Git",
        category: "Tools",
        action: () => {
          const focused = activeSessions.find((s) => s.id === focusedSessionId);
          setCommandPaletteOpen(false);
          setGitManagerOpen(true, focused?.working_dir);
        },
      },
      {
        id: "open-mcp",
        label: "MCP",
        category: "Tools",
        action: () => {
          const focused = activeSessions.find((s) => s.id === focusedSessionId);
          setCommandPaletteOpen(false);
          setMcpManagerOpen(true, focused?.working_dir);
        },
      },
      {
        id: "open-claude-md",
        label: "CLAUDE.md",
        category: "Tools",
        action: () => {
          const focused = activeSessions.find((s) => s.id === focusedSessionId);
          setCommandPaletteOpen(false);
          if (focused?.working_dir) {
            useAppStore.getState().setClaudeMdEditorOpen(true, focused.working_dir);
          }
        },
      },
    ];

    // Layout presets
    const presets: { label: string; value: PresetLayout }[] = [
      { label: "1×1", value: "1x1" },
      { label: "2×2", value: "2x2" },
      { label: "3×3", value: "3x3" },
      { label: "1+2", value: "1+2" },
      { label: "1+3", value: "1+3" },
    ];

    for (const p of presets) {
      items.push({
        id: `layout-${p.value}`,
        label: `Layout ${p.label}`,
        category: "Layouts",
        action: () => {
          applyPreset(p.value, activeSessions.map((s) => s.id));
          setCommandPaletteOpen(false);
        },
      });
    }

    // Send skills to focused session
    if (focusedSessionId) {
      for (const skill of skills.slice(0, 10)) {
        items.push({
          id: `skill-${skill.name}`,
          label: skill.name,
          matchText: `${skill.name} ${skill.description}`,
          category: "Skills",
          action: async () => {
            try {
              await sendToSession(focusedSessionId, skill.name);
            } catch (e) { addToast(`Failed to send skill: ${e}`, "error"); }
            setCommandPaletteOpen(false);
          },
        });
      }
    }

    // Session commands
    for (const session of activeSessions) {
      items.push({
        id: `focus-${session.id}`,
        label: `Focus [${session.pane_number}] ${session.working_dir.split("/").pop() ?? ""}`,
        category: "Sessions",
        action: () => {
          setFocusedSession(session.id);
          window.dispatchEvent(new CustomEvent("codegrid:focus-terminal", { detail: { sessionId: session.id } }));
          setCommandPaletteOpen(false);
        },
      });
      items.push({
        id: `maximize-${session.id}`,
        label: `Max [${session.pane_number}]`,
        category: "Sessions",
        action: () => { toggleMaximize(session.id); setCommandPaletteOpen(false); },
      });
    }

    // Kill idle
    const idleSessions = activeSessions.filter((s) => s.status === "idle" || s.status === "dead");
    if (idleSessions.length > 0) {
      items.push({
        id: "kill-idle",
        label: `Close idle (${idleSessions.length})`,
        category: "Sessions",
        action: () => {
          for (const s of idleSessions) {
            window.dispatchEvent(new CustomEvent("codegrid:close-session", { detail: { sessionId: s.id } }));
          }
          setCommandPaletteOpen(false);
        },
      });
    }

    return items;
  }, [activeSessions, focusedSessionId, skills, setCommandPaletteOpen, setNewSessionDialogOpen, toggleSidebar, toggleBroadcast, setHubBrowserOpen, setSkillsPanelOpen, setSettingsOpen, setGitManagerOpen, setMcpManagerOpen, setFocusedSession, applyPreset, toggleMaximize, addToast]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter((c) => {
      const hay = (c.matchText ?? c.label).toLowerCase();
      return hay.includes(lower) || c.category.toLowerCase().includes(lower);
    });
  }, [commands, query]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [commandPaletteOpen]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") { setCommandPaletteOpen(false); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter") { e.preventDefault(); filtered[selectedIndex]?.action(); return; }
    },
    [filtered, selectedIndex, setCommandPaletteOpen],
  );

  if (!commandPaletteOpen) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", justifyContent: "center", paddingTop: "80px" }}
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.6)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        style={{
          position: "relative", width: "560px", maxHeight: "400px", background: "#141414",
          border: "1px solid #ff8c00", display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", zIndex: 1,
        }}
      >
        <div style={{ borderBottom: "1px solid #2a2a2a" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Command…"
            style={{
              width: "100%", background: "transparent", border: "none", color: "#e0e0e0",
              fontSize: "13px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "12px 16px", outline: "none",
            }}
          />
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "16px", color: "#555555", textAlign: "center", fontSize: "12px" }}>
              No commands found
            </div>
          ) : (
            filtered.map((item, index) => (
              <div
                key={item.id}
                onClick={() => item.action()}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                  padding: "8px 16px", cursor: "pointer",
                  background: index === selectedIndex ? "#1e1e1e" : "transparent",
                  borderLeft: index === selectedIndex ? "2px solid #ff8c00" : "2px solid transparent",
                }}
              >
                <span style={{
                  color: index === selectedIndex ? "#e0e0e0" : "#888888", fontSize: "12px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1,
                }}>
                  {item.label}
                </span>
                <span style={{ color: "#555555", fontSize: "10px", flexShrink: 0 }}>
                  {item.category}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});
