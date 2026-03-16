import React, { memo, useState, useEffect, useCallback } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useToastStore } from "../stores/toastStore";
import { getSetting, setSetting, getClaudePath } from "../lib/ipc";

export const Settings = memo(function Settings() {
  const { settingsOpen, setSettingsOpen, vibeMode, setVibeMode } = useWorkspaceStore();
  const addToast = useToastStore((s) => s.addToast);
  const [fontSize, setFontSize] = useState("13");
  const [fontFamily, setFontFamily] = useState("SF Mono");
  const [claudePath, setClaudePath] = useState("");
  const [maxSessions, setMaxSessions] = useState("20");
  const [autoWorktree, setAutoWorktree] = useState("true");
  const [tab, setTab] = useState<"general" | "terminal" | "shortcuts">("general");

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
        const aw = await getSetting("autoWorktree");
        if (aw) setAutoWorktree(aw);
        const vm = await getSetting("vibeMode");
        if (vm) setVibeMode(vm === "true");
        const cp = await getClaudePath();
        setClaudePath(cp);
      } catch (e) { console.warn("Failed to load settings:", e); }
    };
    load();
  }, [settingsOpen]);

  const handleVibeToggle = useCallback(async () => {
    const newVal = !vibeMode;
    setVibeMode(newVal);
    try {
      await setSetting("vibeMode", newVal ? "true" : "false");
    } catch {
      // revert on failure
      setVibeMode(!newVal);
    }
  }, [vibeMode, setVibeMode]);

  const handleSave = useCallback(async () => {
    try {
      await setSetting("fontSize", fontSize);
      await setSetting("fontFamily", fontFamily);
      await setSetting("maxSessions", maxSessions);
      await setSetting("autoWorktree", autoWorktree);
      await setSetting("vibeMode", vibeMode ? "true" : "false");
      addToast("Settings saved", "success");
    } catch {
      addToast("Failed to save settings", "error");
    }
  }, [fontSize, fontFamily, maxSessions, autoWorktree, vibeMode, addToast]);

  if (!settingsOpen) return null;

  const tabs = [
    { id: "general" as const, label: "General" },
    { id: "terminal" as const, label: "Terminal" },
    { id: "shortcuts" as const, label: "Shortcuts" },
  ];

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", justifyContent: "center", paddingTop: "80px" }}
      onClick={() => setSettingsOpen(false)}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.6)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        style={{
          position: "relative", width: "500px", maxHeight: "550px", background: "#141414",
          border: "1px solid #ff8c00", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", zIndex: 1,
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a2a", color: "#ff8c00", fontSize: "12px", fontWeight: "bold", letterSpacing: "1px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          SETTINGS
          <button onClick={() => setSettingsOpen(false)} aria-label="Close settings" style={{ background: "none", border: "none", color: "#555555", fontSize: "14px", cursor: "pointer", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace" }}>x</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "8px", background: tab === t.id ? "#1e1e1e" : "transparent",
              border: "none", borderBottom: tab === t.id ? "2px solid #ff8c00" : "2px solid transparent",
              color: tab === t.id ? "#ff8c00" : "#555555", fontSize: "10px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              cursor: "pointer", letterSpacing: "0.5px",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {tab === "general" && (
            <>
              {/* Vibe Mode Toggle */}
              <div
                onClick={handleVibeToggle}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  background: vibeMode ? "rgba(255, 140, 0, 0.1)" : "#0a0a0a",
                  border: vibeMode ? "1px solid #ff8c00" : "1px solid #2a2a2a",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div>
                  <div style={{
                    color: vibeMode ? "#ff8c00" : "#e0e0e0",
                    fontSize: "13px",
                    fontWeight: "bold",
                    letterSpacing: "2px",
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                  }}>
                    VIBE MODE
                  </div>
                  <div style={{ color: "#888888", fontSize: "10px", marginTop: "4px", lineHeight: "1.4" }}>
                    Simplified interface for AI-assisted coding. Hides technical details and uses friendly language.
                  </div>
                </div>
                <div style={{
                  width: "40px",
                  height: "20px",
                  borderRadius: "10px",
                  background: vibeMode ? "#ff8c00" : "#333333",
                  position: "relative",
                  flexShrink: 0,
                  marginLeft: "12px",
                  transition: "background 0.2s ease",
                }}>
                  <div style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: vibeMode ? "#0a0a0a" : "#888888",
                    position: "absolute",
                    top: "2px",
                    left: vibeMode ? "22px" : "2px",
                    transition: "left 0.2s ease, background 0.2s ease",
                  }} />
                </div>
              </div>

              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>MAX SESSIONS</div>
                <input value={maxSessions} onChange={(e) => setMaxSessions(e.target.value)} type="number" min="1" max="50"
                  style={{ width: "80px", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "12px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "6px 8px", outline: "none" }} />
              </div>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>AUTO GIT WORKTREE</div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#888888", fontSize: "11px", cursor: "pointer" }}>
                  <input type="checkbox" checked={autoWorktree === "true"} onChange={(e) => setAutoWorktree(e.target.checked ? "true" : "false")} style={{ accentColor: "#ff8c00" }} />
                  Automatically create git worktrees for new sessions in the same repo
                </label>
              </div>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>CLAUDE BINARY</div>
                <div style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#555555", fontSize: "11px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "6px 8px" }}>
                  {claudePath || "Not found — install with: npm i -g @anthropic-ai/claude-code"}
                </div>
              </div>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>VERSION</div>
                <div style={{ color: "#555555", fontSize: "11px" }}>Code Grid v0.1.0</div>
              </div>
            </>
          )}

          {tab === "terminal" && (
            <>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>FONT SIZE</div>
                <input value={fontSize} onChange={(e) => setFontSize(e.target.value)} type="number" min="8" max="24"
                  style={{ width: "80px", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "12px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "6px 8px", outline: "none" }} />
              </div>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>FONT FAMILY</div>
                <input value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}
                  style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "12px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "6px 8px", outline: "none" }} />
              </div>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "8px", letterSpacing: "0.5px" }}>THEME</div>
                <div style={{ color: "#555555", fontSize: "11px" }}>Code Grid Dark (default)</div>
              </div>
            </>
          )}

          {tab === "shortcuts" && (
            <div style={{ fontSize: "10px", color: "#555555", display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px" }}>
              {[
                ["Cmd+N", "New Session"],
                ["Cmd+W", "Close Session"],
                ["Cmd+K", "Command Palette"],
                ["Cmd+B", "Broadcast Mode"],
                ["Cmd+Enter", "Maximize Pane"],
                ["Cmd+Arrow", "Navigate Panes"],
                ["Cmd+Shift+Arrow", "Swap Panes"],
                ["Cmd+1-9", "Jump to Pane"],
                ["Cmd+S", "Toggle Sidebar"],
                ["Cmd+Tab", "Next Workspace"],
                ["Cmd+Shift+Tab", "Prev Workspace"],
                ["Cmd+Shift+N", "New Workspace"],
                ["Cmd+,", "Settings"],
              ].map(([key, desc]) => (
                <React.Fragment key={key}>
                  <span style={{ color: "#888888", fontWeight: "bold" }}>{key}</span>
                  <span>{desc}</span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Save button */}
        {tab !== "shortcuts" && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid #2a2a2a", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={handleSave} style={{
              background: "#ff8c00", border: "1px solid #ff8c00", color: "#0a0a0a",
              fontSize: "11px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
              padding: "6px 16px", fontWeight: "bold",
            }}>
              SAVE
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
