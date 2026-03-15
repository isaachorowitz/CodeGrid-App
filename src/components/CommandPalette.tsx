import { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSessionStore } from "../stores/sessionStore";
import { useLayoutStore, type PresetLayout } from "../stores/layoutStore";

interface CommandItem {
  id: string;
  label: string;
  category: string;
  action: () => void;
}

export const CommandPalette = memo(function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setNewSessionDialogOpen, toggleSidebar, setSettingsOpen } = useWorkspaceStore();
  const sessions = useSessionStore((s) => s.sessions);
  const { setFocusedSession, toggleBroadcast } = useSessionStore();
  const { applyPreset, toggleMaximize } = useLayoutStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: "new-session",
        label: "New Claude Code Session",
        category: "Sessions",
        action: () => {
          setCommandPaletteOpen(false);
          setNewSessionDialogOpen(true);
        },
      },
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        category: "View",
        action: () => {
          setCommandPaletteOpen(false);
          toggleSidebar();
        },
      },
      {
        id: "toggle-broadcast",
        label: "Toggle Broadcast Mode",
        category: "View",
        action: () => {
          setCommandPaletteOpen(false);
          toggleBroadcast();
        },
      },
      {
        id: "settings",
        label: "Open Settings",
        category: "App",
        action: () => {
          setCommandPaletteOpen(false);
          setSettingsOpen(true);
        },
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
          const ids = sessions.map((s) => s.id);
          applyPreset(p.value, ids);
          setCommandPaletteOpen(false);
        },
      });
    }

    // Session focus/maximize commands
    for (const session of sessions) {
      items.push({
        id: `focus-${session.id}`,
        label: `Focus Pane ${session.pane_number}: ${session.working_dir.split("/").pop()}`,
        category: "Sessions",
        action: () => {
          setFocusedSession(session.id);
          window.dispatchEvent(
            new CustomEvent("gridcode:focus-terminal", {
              detail: { sessionId: session.id },
            }),
          );
          setCommandPaletteOpen(false);
        },
      });
      items.push({
        id: `maximize-${session.id}`,
        label: `Maximize Pane ${session.pane_number}`,
        category: "Sessions",
        action: () => {
          toggleMaximize(session.id);
          setCommandPaletteOpen(false);
        },
      });
    }

    // Kill idle sessions
    const idleSessions = sessions.filter((s) => s.status === "idle" || s.status === "dead");
    if (idleSessions.length > 0) {
      items.push({
        id: "kill-idle",
        label: `Kill All Idle/Dead Sessions (${idleSessions.length})`,
        category: "Sessions",
        action: () => {
          for (const s of idleSessions) {
            window.dispatchEvent(
              new CustomEvent("gridcode:close-session", {
                detail: { sessionId: s.id },
              }),
            );
          }
          setCommandPaletteOpen(false);
        },
      });
    }

    return items;
  }, [sessions, setCommandPaletteOpen, setNewSessionDialogOpen, toggleSidebar, toggleBroadcast, setSettingsOpen, setFocusedSession, applyPreset, toggleMaximize]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(lower) ||
        c.category.toLowerCase().includes(lower),
    );
  }, [commands, query]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setCommandPaletteOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
        }
        return;
      }
    },
    [filtered, selectedIndex, setCommandPaletteOpen],
  );

  if (!commandPaletteOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        paddingTop: "80px",
      }}
      onClick={() => setCommandPaletteOpen(false)}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.6)",
        }}
      />

      {/* Palette */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "560px",
          maxHeight: "400px",
          background: "#141414",
          border: "1px solid #ff8c00",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'SF Mono', 'Menlo', monospace",
          zIndex: 1,
        }}
      >
        {/* Input */}
        <div style={{ borderBottom: "1px solid #2a2a2a" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              color: "#e0e0e0",
              fontSize: "13px",
              fontFamily: "'SF Mono', 'Menlo', monospace",
              padding: "12px 16px",
              outline: "none",
            }}
          />
        </div>

        {/* Results */}
        <div style={{ overflow: "auto", flex: 1 }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "16px",
                color: "#555555",
                textAlign: "center",
                fontSize: "12px",
              }}
            >
              No commands found
            </div>
          ) : (
            filtered.map((item, index) => (
              <div
                key={item.id}
                onClick={() => item.action()}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 16px",
                  cursor: "pointer",
                  background:
                    index === selectedIndex ? "#1e1e1e" : "transparent",
                  borderLeft:
                    index === selectedIndex
                      ? "2px solid #ff8c00"
                      : "2px solid transparent",
                }}
              >
                <span
                  style={{
                    color: index === selectedIndex ? "#e0e0e0" : "#888888",
                    fontSize: "12px",
                  }}
                >
                  {item.label}
                </span>
                <span
                  style={{
                    color: "#555555",
                    fontSize: "10px",
                  }}
                >
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
