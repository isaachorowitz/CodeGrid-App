import { memo, useState, useEffect, useCallback } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useToastStore } from "../stores/toastStore";
import { getSetting, setSetting, getClaudePath } from "../lib/ipc";

export const Settings = memo(function Settings() {
  const { settingsOpen, setSettingsOpen } = useWorkspaceStore();
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
        const cp = await getClaudePath();
        setClaudePath(cp);
      } catch {}
    };
    load();
  }, [settingsOpen]);

  const handleSave = useCallback(async () => {
    try {
      await setSetting("fontSize", fontSize);
      await setSetting("fontFamily", fontFamily);
      await setSetting("maxSessions", maxSessions);
      await setSetting("autoWorktree", autoWorktree);
      addToast("Settings saved", "success");
    } catch {
      addToast("Failed to save settings", "error");
    }
  }, [fontSize, fontFamily, maxSessions, autoWorktree, addToast]);

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
        style={{
          position: "relative", width: "500px", maxHeight: "550px", background: "#141414",
          border: "1px solid #ff8c00", fontFamily: "'SF Mono', 'Menlo', monospace", zIndex: 1,
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a2a", color: "#ff8c00", fontSize: "12px", fontWeight: "bold", letterSpacing: "1px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          SETTINGS
          <button onClick={() => setSettingsOpen(false)} style={{ background: "none", border: "none", color: "#555555", fontSize: "14px", cursor: "pointer", fontFamily: "'SF Mono', monospace" }}>x</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "8px", background: tab === t.id ? "#1e1e1e" : "transparent",
              border: "none", borderBottom: tab === t.id ? "2px solid #ff8c00" : "2px solid transparent",
              color: tab === t.id ? "#ff8c00" : "#555555", fontSize: "10px", fontFamily: "'SF Mono', monospace",
              cursor: "pointer", letterSpacing: "0.5px",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {tab === "general" && (
            <>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>MAX SESSIONS</div>
                <input value={maxSessions} onChange={(e) => setMaxSessions(e.target.value)} type="number" min="1" max="50"
                  style={{ width: "80px", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "12px", fontFamily: "'SF Mono', monospace", padding: "6px 8px", outline: "none" }} />
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
                <div style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#555555", fontSize: "11px", fontFamily: "'SF Mono', monospace", padding: "6px 8px" }}>
                  {claudePath || "Not found — install with: npm i -g @anthropic-ai/claude-code"}
                </div>
              </div>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>VERSION</div>
                <div style={{ color: "#555555", fontSize: "11px" }}>GridCode v0.1.0</div>
              </div>
            </>
          )}

          {tab === "terminal" && (
            <>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>FONT SIZE</div>
                <input value={fontSize} onChange={(e) => setFontSize(e.target.value)} type="number" min="8" max="24"
                  style={{ width: "80px", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "12px", fontFamily: "'SF Mono', monospace", padding: "6px 8px", outline: "none" }} />
              </div>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>FONT FAMILY</div>
                <input value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}
                  style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "12px", fontFamily: "'SF Mono', monospace", padding: "6px 8px", outline: "none" }} />
              </div>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "8px", letterSpacing: "0.5px" }}>THEME</div>
                <div style={{ color: "#555555", fontSize: "11px" }}>Bloomberg Dark (default)</div>
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
                <>
                  <span key={`k-${key}`} style={{ color: "#888888", fontWeight: "bold" }}>{key}</span>
                  <span key={`d-${key}`}>{desc}</span>
                </>
              ))}
            </div>
          )}
        </div>

        {/* Save button */}
        {tab !== "shortcuts" && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid #2a2a2a", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={handleSave} style={{
              background: "#ff8c00", border: "1px solid #ff8c00", color: "#0a0a0a",
              fontSize: "11px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
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
