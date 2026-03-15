import { memo, useState, useEffect, useCallback } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { getSetting, setSetting, getClaudePath } from "../lib/ipc";

export const Settings = memo(function Settings() {
  const { settingsOpen, setSettingsOpen } = useWorkspaceStore();
  const [fontSize, setFontSize] = useState("13");
  const [fontFamily, setFontFamily] = useState("SF Mono");
  const [claudePath, setClaudePath] = useState("");
  const [maxSessions, setMaxSessions] = useState("20");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settingsOpen) return;
    const load = async () => {
      try {
        const fs = await getSetting("fontSize");
        if (fs) setFontSize(fs);
        const ff = await getSetting("fontFamily");
        if (ff) setFontFamily(ff);
        const ms = await getSetting("maxSessions");
        if (ms) setMaxSessions(ms);
        const cp = await getClaudePath();
        setClaudePath(cp);
      } catch {
        // Outside Tauri
      }
    };
    load();
  }, [settingsOpen]);

  const handleSave = useCallback(async () => {
    try {
      await setSetting("fontSize", fontSize);
      await setSetting("fontFamily", fontFamily);
      await setSetting("maxSessions", maxSessions);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Outside Tauri
    }
  }, [fontSize, fontFamily, maxSessions]);

  if (!settingsOpen) return null;

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
      onClick={() => setSettingsOpen(false)}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.6)",
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "440px",
          maxHeight: "500px",
          background: "#141414",
          border: "1px solid #ff8c00",
          fontFamily: "'SF Mono', 'Menlo', monospace",
          zIndex: 1,
          overflow: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #2a2a2a",
            color: "#ff8c00",
            fontSize: "12px",
            fontWeight: "bold",
            letterSpacing: "1px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          SETTINGS
          <button
            onClick={() => setSettingsOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: "#555555",
              fontSize: "14px",
              cursor: "pointer",
              fontFamily: "'SF Mono', monospace",
            }}
          >
            x
          </button>
        </div>

        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Font Size */}
          <div>
            <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>
              FONT SIZE
            </div>
            <input
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              type="number"
              min="8"
              max="24"
              style={{
                width: "80px",
                background: "#0a0a0a",
                border: "1px solid #2a2a2a",
                color: "#e0e0e0",
                fontSize: "12px",
                fontFamily: "'SF Mono', monospace",
                padding: "6px 8px",
                outline: "none",
              }}
            />
          </div>

          {/* Font Family */}
          <div>
            <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>
              FONT FAMILY
            </div>
            <input
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              style={{
                width: "100%",
                background: "#0a0a0a",
                border: "1px solid #2a2a2a",
                color: "#e0e0e0",
                fontSize: "12px",
                fontFamily: "'SF Mono', monospace",
                padding: "6px 8px",
                outline: "none",
              }}
            />
          </div>

          {/* Max Sessions */}
          <div>
            <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>
              MAX SESSIONS
            </div>
            <input
              value={maxSessions}
              onChange={(e) => setMaxSessions(e.target.value)}
              type="number"
              min="1"
              max="50"
              style={{
                width: "80px",
                background: "#0a0a0a",
                border: "1px solid #2a2a2a",
                color: "#e0e0e0",
                fontSize: "12px",
                fontFamily: "'SF Mono', monospace",
                padding: "6px 8px",
                outline: "none",
              }}
            />
          </div>

          {/* Claude Path (read-only) */}
          <div>
            <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>
              CLAUDE BINARY
            </div>
            <div
              style={{
                background: "#0a0a0a",
                border: "1px solid #2a2a2a",
                color: "#555555",
                fontSize: "11px",
                fontFamily: "'SF Mono', monospace",
                padding: "6px 8px",
              }}
            >
              {claudePath || "Not found"}
            </div>
          </div>

          {/* Keyboard shortcuts reference */}
          <div>
            <div style={{ color: "#888888", fontSize: "10px", marginBottom: "8px", letterSpacing: "0.5px" }}>
              KEYBOARD SHORTCUTS
            </div>
            <div style={{ fontSize: "10px", color: "#555555", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
              <span style={{ color: "#888888" }}>Cmd+N</span><span>New Pane</span>
              <span style={{ color: "#888888" }}>Cmd+W</span><span>Close Pane</span>
              <span style={{ color: "#888888" }}>Cmd+K</span><span>Command Palette</span>
              <span style={{ color: "#888888" }}>Cmd+B</span><span>Broadcast</span>
              <span style={{ color: "#888888" }}>Cmd+Enter</span><span>Maximize</span>
              <span style={{ color: "#888888" }}>Cmd+Arrow</span><span>Navigate</span>
              <span style={{ color: "#888888" }}>Cmd+1-9</span><span>Jump to Pane</span>
              <span style={{ color: "#888888" }}>Cmd+S</span><span>Toggle Sidebar</span>
              <span style={{ color: "#888888" }}>Cmd+Tab</span><span>Next Workspace</span>
            </div>
          </div>

          {/* Save */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            {saved && (
              <span style={{ color: "#00c853", fontSize: "11px", alignSelf: "center" }}>
                Saved
              </span>
            )}
            <button
              onClick={handleSave}
              style={{
                background: "#ff8c00",
                border: "1px solid #ff8c00",
                color: "#0a0a0a",
                fontSize: "11px",
                fontFamily: "'SF Mono', monospace",
                cursor: "pointer",
                padding: "6px 16px",
                fontWeight: "bold",
              }}
            >
              SAVE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
