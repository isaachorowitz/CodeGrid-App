import React, { memo, useState, useEffect, useCallback } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useToastStore } from "../stores/toastStore";
import { getSetting, setSetting, getClaudePath, getEnvAllowStatus, toggleEnvAllow } from "../lib/ipc";
import { useLicenseStore } from "../stores/licenseStore";

export const Settings = memo(function Settings() {
  const { settingsOpen, setSettingsOpen } = useWorkspaceStore();
  const addToast = useToastStore((s) => s.addToast);
  const [claudePath, setClaudePath] = useState("");
  const [maxSessions, setMaxSessions] = useState("20");
  const [tab, setTab] = useState<"general" | "terminal" | "shortcuts" | "license">("general");
  const [envAllow, setEnvAllow] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseActivating, setLicenseActivating] = useState(false);
  const licenseStatus = useLicenseStore((s) => s.status);
  const licenseError = useLicenseStore((s) => s.error);
  const licenseActivate = useLicenseStore((s) => s.activate);
  const licenseDeactivate = useLicenseStore((s) => s.deactivate);

  useEffect(() => {
    if (!settingsOpen) return;
    const load = async () => {
      try {
        const ms = await getSetting("maxSessions");
        if (ms) setMaxSessions(ms);
        const cp = await getClaudePath();
        setClaudePath(cp);
        // Load env allow status
        const ws = useWorkspaceStore.getState().workspaces.find(w => w.id === useWorkspaceStore.getState().activeWorkspaceId);
        if (ws?.repo_path) {
          try {
            const status = await getEnvAllowStatus(ws.repo_path);
            setEnvAllow(status);
          } catch {}
        }
      } catch (e) { console.warn("Failed to load settings:", e); }
    };
    load();
  }, [settingsOpen]);

  const handleEnvAllowToggle = useCallback(async () => {
    const ws = useWorkspaceStore.getState().workspaces.find(w => w.id === useWorkspaceStore.getState().activeWorkspaceId);
    if (!ws?.repo_path) return;
    const newVal = !envAllow;
    setEnvAllow(newVal);
    try {
      await toggleEnvAllow(ws.repo_path, newVal);
    } catch {
      setEnvAllow(!newVal);
    }
  }, [envAllow]);

  const handleSave = useCallback(async () => {
    try {
      await setSetting("maxSessions", maxSessions);
      addToast("Settings saved", "success");
    } catch {
      addToast("Failed to save settings", "error");
    }
  }, [maxSessions, addToast]);

  if (!settingsOpen) return null;

  const tabs = [
    { id: "general" as const, label: "General" },
    { id: "terminal" as const, label: "Terminal" },
    { id: "shortcuts" as const, label: "Shortcuts" },
    { id: "license" as const, label: "License" },
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
              {/* .env Editing Toggle */}
              {(() => {
                const ws = useWorkspaceStore.getState().workspaces.find(w => w.id === useWorkspaceStore.getState().activeWorkspaceId);
                const hasRepo = !!ws?.repo_path;
                return (
                  <div
                    onClick={hasRepo ? handleEnvAllowToggle : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: envAllow ? "rgba(255, 140, 0, 0.1)" : "#0a0a0a",
                      border: envAllow ? "1px solid #ff8c00" : "1px solid #2a2a2a",
                      cursor: hasRepo ? "pointer" : "not-allowed",
                      transition: "all 0.2s ease",
                      opacity: hasRepo ? 1 : 0.4,
                    }}
                  >
                    <div>
                      <div style={{
                        color: envAllow ? "#ff8c00" : "#e0e0e0",
                        fontSize: "11px",
                        fontWeight: "bold",
                        letterSpacing: "1.5px",
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                      }}>
                        .ENV EDITING
                      </div>
                      <div style={{ color: "#888888", fontSize: "10px", marginTop: "3px", lineHeight: "1.4" }}>
                        {hasRepo
                          ? "Let Claude Code read and modify .env files in this workspace"
                          : "Set a repo path on this workspace to enable"}
                      </div>
                    </div>
                    <div style={{
                      width: "36px",
                      height: "18px",
                      borderRadius: "9px",
                      background: envAllow ? "#ff8c00" : "#333333",
                      position: "relative",
                      flexShrink: 0,
                      marginLeft: "12px",
                      transition: "background 0.2s ease",
                    }}>
                      <div style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        background: envAllow ? "#0a0a0a" : "#888888",
                        position: "absolute",
                        top: "2px",
                        left: envAllow ? "20px" : "2px",
                        transition: "left 0.2s ease, background 0.2s ease",
                      }} />
                    </div>
                  </div>
                );
              })()}

              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>MAX SESSIONS</div>
                <input value={maxSessions} onChange={(e) => setMaxSessions(e.target.value)} type="number" min="1" max="50"
                  style={{ width: "80px", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "12px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "6px 8px", outline: "none" }} />
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
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "8px", letterSpacing: "0.5px" }}>THEME</div>
                <div style={{ color: "#555555", fontSize: "11px" }}>Code Grid Dark (default)</div>
              </div>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>TERMINAL FONT</div>
                <div style={{ color: "#555555", fontSize: "11px" }}>JetBrains Mono, 13px (fixed)</div>
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

          {tab === "license" && (
            <>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>STATUS</div>
                <div style={{ color: licenseStatus?.is_licensed && !licenseStatus?.is_trial ? "#00c853" : "#888888", fontSize: "11px" }}>
                  {!licenseStatus
                    ? "Loading..."
                    : licenseStatus.is_licensed && !licenseStatus.is_trial
                    ? "Licensed — unlimited panes"
                    : licenseStatus.is_trial && licenseStatus.trial_days_remaining > 0
                    ? `Trial — ${licenseStatus.trial_days_remaining} day${licenseStatus.trial_days_remaining !== 1 ? "s" : ""} remaining (${licenseStatus.max_panes} pane limit)`
                    : `Trial expired — limited to ${licenseStatus?.max_panes ?? 2} panes`}
                </div>
              </div>
              {licenseStatus?.is_licensed && !licenseStatus?.is_trial ? (
                <>
                  <div>
                    <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>LICENSE KEY</div>
                    <div style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "11px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "6px 8px" }}>
                      {licenseStatus.license_key ? licenseStatus.license_key.slice(0, 4) + "-****-****-" + licenseStatus.license_key.slice(-4) : "Active"}
                    </div>
                  </div>
                  <button
                    onClick={async () => { await licenseDeactivate(); }}
                    style={{
                      background: "transparent", border: "1px solid #2a2a2a", color: "#888888",
                      fontSize: "11px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
                      padding: "6px 16px", alignSelf: "flex-start",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff4444"; e.currentTarget.style.color = "#ff4444"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#888888"; }}
                  >
                    DEACTIVATE
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>LICENSE KEY</div>
                    <input
                      value={licenseKey}
                      onChange={(e) => setLicenseKey(e.target.value)}
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && licenseKey.trim()) {
                          setLicenseActivating(true);
                          const ok = await licenseActivate(licenseKey.trim());
                          setLicenseActivating(false);
                          if (ok) setLicenseKey("");
                        }
                      }}
                      style={{
                        width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0",
                        fontSize: "12px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                        padding: "6px 8px", outline: "none", boxSizing: "border-box",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                    />
                  </div>
                  {licenseError && (
                    <div style={{ color: "#ff4444", fontSize: "11px" }}>{licenseError}</div>
                  )}
                  <button
                    onClick={async () => {
                      if (!licenseKey.trim()) return;
                      setLicenseActivating(true);
                      const ok = await licenseActivate(licenseKey.trim());
                      setLicenseActivating(false);
                      if (ok) setLicenseKey("");
                    }}
                    disabled={!licenseKey.trim() || licenseActivating}
                    style={{
                      background: licenseKey.trim() ? "#ff8c00" : "#2a2a2a", border: "1px solid #ff8c00",
                      color: licenseKey.trim() ? "#0a0a0a" : "#555555",
                      fontSize: "11px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                      cursor: licenseKey.trim() && !licenseActivating ? "pointer" : "default",
                      padding: "6px 16px", fontWeight: "bold", alignSelf: "flex-start",
                      opacity: licenseActivating ? 0.7 : 1,
                    }}
                  >
                    {licenseActivating ? "ACTIVATING..." : "ACTIVATE"}
                  </button>
                </>
              )}
            </>
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
