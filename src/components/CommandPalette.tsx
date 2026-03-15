import { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSessionStore } from "../stores/sessionStore";
import { useLayoutStore, type PresetLayout } from "../stores/layoutStore";
import { useAppStore } from "../stores/appStore";
import { sendToSession } from "../lib/ipc";

interface CommandItem {
  id: string;
  label: string;
  category: string;
  action: () => void;
}

export const CommandPalette = memo(function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setNewSessionDialogOpen, toggleSidebar, setSettingsOpen } = useWorkspaceStore();
  const sessions = useSessionStore((s) => s.sessions);
  const { setFocusedSession, toggleBroadcast, focusedSessionId } = useSessionStore();
  const { applyPreset, toggleMaximize } = useLayoutStore();
  const { setSkillsPanelOpen, setHubBrowserOpen, skills, models } = useAppStore();
  const setSessionModel = useSessionStore((s) => s.setSessionModel);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      // Sessions
      {
        id: "new-session",
        label: "New Session — Start coding with Claude",
        category: "Sessions",
        action: () => { setCommandPaletteOpen(false); setNewSessionDialogOpen(true); },
      },
      // View
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        category: "View",
        action: () => { setCommandPaletteOpen(false); toggleSidebar(); },
      },
      {
        id: "toggle-broadcast",
        label: "Toggle Broadcast Mode — type to all panes",
        category: "View",
        action: () => { setCommandPaletteOpen(false); toggleBroadcast(); },
      },
      // Tools
      {
        id: "open-hub",
        label: "Open Hub — Browse & clone repos",
        category: "Tools",
        action: () => { setCommandPaletteOpen(false); setHubBrowserOpen(true); },
      },
      {
        id: "open-skills",
        label: "Open Skills Panel — Claude Code slash commands",
        category: "Tools",
        action: () => { setCommandPaletteOpen(false); setSkillsPanelOpen(true); },
      },
      {
        id: "settings",
        label: "Open Settings",
        category: "App",
        action: () => { setCommandPaletteOpen(false); setSettingsOpen(true); },
      },
    ];

    // Layout presets
    const presets: { label: string; value: PresetLayout }[] = [
      { label: "1x1 — Single Pane", value: "1x1" },
      { label: "2x2 — Four Quadrants", value: "2x2" },
      { label: "3x3 — Nine Panes", value: "3x3" },
      { label: "1+2 — One Large + Two Small", value: "1+2" },
      { label: "1+3 — One Large + Three Small", value: "1+3" },
    ];

    for (const p of presets) {
      items.push({
        id: `layout-${p.value}`,
        label: `Layout: ${p.label}`,
        category: "Layouts",
        action: () => {
          applyPreset(p.value, sessions.map((s) => s.id));
          setCommandPaletteOpen(false);
        },
      });
    }

    // Model switching for focused session
    if (focusedSessionId) {
      for (const m of models) {
        items.push({
          id: `model-${m.id}`,
          label: `Switch to ${m.name} — ${m.description}`,
          category: "Models",
          action: async () => {
            setSessionModel(focusedSessionId, m.id);
            try {
              await sendToSession(focusedSessionId, `/model ${m.id}`);
            } catch {}
            setCommandPaletteOpen(false);
          },
        });
      }
    }

    // Send skills to focused session
    if (focusedSessionId) {
      for (const skill of skills.slice(0, 10)) {
        items.push({
          id: `skill-${skill.name}`,
          label: `Send ${skill.name} — ${skill.description}`,
          category: "Skills",
          action: async () => {
            try {
              await sendToSession(focusedSessionId, skill.name);
            } catch {}
            setCommandPaletteOpen(false);
          },
        });
      }
    }

    // Session commands
    for (const session of sessions) {
      items.push({
        id: `focus-${session.id}`,
        label: `Focus Pane ${session.pane_number}: ${session.working_dir.split("/").pop()}`,
        category: "Sessions",
        action: () => {
          setFocusedSession(session.id);
          window.dispatchEvent(new CustomEvent("gridcode:focus-terminal", { detail: { sessionId: session.id } }));
          setCommandPaletteOpen(false);
        },
      });
      items.push({
        id: `maximize-${session.id}`,
        label: `Maximize Pane ${session.pane_number}`,
        category: "Sessions",
        action: () => { toggleMaximize(session.id); setCommandPaletteOpen(false); },
      });
    }

    // Kill idle
    const idleSessions = sessions.filter((s) => s.status === "idle" || s.status === "dead");
    if (idleSessions.length > 0) {
      items.push({
        id: "kill-idle",
        label: `Kill All Idle/Dead Sessions (${idleSessions.length})`,
        category: "Sessions",
        action: () => {
          for (const s of idleSessions) {
            window.dispatchEvent(new CustomEvent("gridcode:close-session", { detail: { sessionId: s.id } }));
          }
          setCommandPaletteOpen(false);
        },
      });
    }

    return items;
  }, [sessions, focusedSessionId, skills, models]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (c) => c.label.toLowerCase().includes(lower) || c.category.toLowerCase().includes(lower),
    );
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
        style={{
          position: "relative", width: "560px", maxHeight: "400px", background: "#141414",
          border: "1px solid #ff8c00", display: "flex", flexDirection: "column",
          fontFamily: "'SF Mono', 'Menlo', monospace", zIndex: 1,
        }}
      >
        <div style={{ borderBottom: "1px solid #2a2a2a" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command... (skills, models, layouts, sessions)"
            style={{
              width: "100%", background: "transparent", border: "none", color: "#e0e0e0",
              fontSize: "13px", fontFamily: "'SF Mono', monospace", padding: "12px 16px", outline: "none",
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
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 16px", cursor: "pointer",
                  background: index === selectedIndex ? "#1e1e1e" : "transparent",
                  borderLeft: index === selectedIndex ? "2px solid #ff8c00" : "2px solid transparent",
                }}
              >
                <span style={{ color: index === selectedIndex ? "#e0e0e0" : "#888888", fontSize: "12px" }}>
                  {item.label}
                </span>
                <span style={{ color: "#555555", fontSize: "10px" }}>
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
