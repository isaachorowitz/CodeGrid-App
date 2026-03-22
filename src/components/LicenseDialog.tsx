import { memo, useState, useCallback } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useLicenseStore } from "../stores/licenseStore";
import { open } from "@tauri-apps/plugin-shell";

const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";
const PURCHASE_URL = "https://codegrid.app/#pricing";

function maskKey(key: string): string {
  if (key.length <= 8) return key;
  return key.slice(0, 4) + "-****-****-" + key.slice(-4);
}

export const LicenseDialog = memo(function LicenseDialog() {
  const { licenseDialogOpen, setLicenseDialogOpen } = useWorkspaceStore();
  const { status, error, activate, deactivate } = useLicenseStore();
  const [key, setKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);

  const handleActivate = useCallback(async () => {
    if (!key.trim()) return;
    setActivating(true);
    const success = await activate(key.trim());
    setActivating(false);
    if (success) {
      setKey("");
      setShowKeyInput(false);
      setLicenseDialogOpen(false);
    }
  }, [key, activate, setLicenseDialogOpen]);

  const handleDeactivate = useCallback(async () => {
    await deactivate();
  }, [deactivate]);

  const handleBuy = useCallback(() => {
    open(PURCHASE_URL);
  }, []);

  if (!licenseDialogOpen) return null;

  const isLicensed = status?.is_licensed && !status?.is_trial;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", justifyContent: "center", paddingTop: "60px" }}
      onClick={() => setLicenseDialogOpen(false)}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.6)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="CodeGrid License"
        style={{
          position: "relative", width: "460px", background: "#141414",
          border: "1px solid #2a2a2a", fontFamily: MONO, zIndex: 1,
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #2a2a2a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#ff8c00", fontSize: "12px", fontWeight: "bold", letterSpacing: "1px" }}>
            {isLicensed ? "LICENSE" : "UPGRADE TO PRO"}
          </span>
          <button onClick={() => { setLicenseDialogOpen(false); setShowKeyInput(false); }} aria-label="Close" style={{ background: "none", border: "none", color: "#555555", fontSize: "14px", cursor: "pointer", fontFamily: MONO }}>x</button>
        </div>

        <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {isLicensed ? (
            /* Licensed view */
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#00c853", fontSize: "11px" }}>&#9679;</span>
                <span style={{ color: "#00c853", fontSize: "12px", fontWeight: "bold" }}>Licensed</span>
              </div>
              <div>
                <div style={{ color: "#555", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>KEY</div>
                <div style={{ background: "#0a0a0a", border: "1px solid #1e1e1e", color: "#888", fontSize: "12px", fontFamily: MONO, padding: "8px 10px" }}>
                  {status.license_key ? maskKey(status.license_key) : "Active"}
                </div>
              </div>
              <div style={{ color: "#888", fontSize: "11px", lineHeight: "1.6" }}>
                Up to 50 panes per workspace. All features unlocked.
              </div>
              <button
                onClick={handleDeactivate}
                style={{
                  background: "transparent", border: "1px solid #2a2a2a", color: "#555",
                  fontSize: "10px", fontFamily: MONO, cursor: "pointer", padding: "5px 14px",
                  alignSelf: "flex-start",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff4444"; e.currentTarget.style.color = "#ff4444"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#555"; }}
              >
                DEACTIVATE
              </button>
            </>
          ) : (
            /* Unlicensed view */
            <>
              {/* Trial status */}
              {status?.is_trial && status.trial_days_remaining > 0 && (
                <div style={{ background: "#1a1a0a", border: "1px solid #3a3a1a", padding: "10px 12px", fontSize: "11px", color: "#cca800", lineHeight: "1.5" }}>
                  Trial active — {status.trial_days_remaining} day{status.trial_days_remaining !== 1 ? "s" : ""} remaining. Full access to all features.
                </div>
              )}
              {status && !status.is_trial && !status.is_licensed && (
                <div style={{ background: "#1a0a0a", border: "1px solid #3a1a1a", padding: "10px 12px", fontSize: "11px", color: "#cc4444", lineHeight: "1.5" }}>
                  Trial expired — limited to {status.max_panes} panes per workspace.
                </div>
              )}

              {/* What you get */}
              <div>
                <div style={{ color: "#e0e0e0", fontSize: "12px", fontWeight: "bold", marginBottom: "10px" }}>CodeGrid Pro — $29</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    "Up to 50 simultaneous panes",
                    "Unlimited workspaces",
                    "Broadcast mode",
                    "Git manager + worktree isolation",
                    "MCP server management",
                    "1 year of free updates",
                  ].map((feature) => (
                    <div key={feature} style={{ color: "#aaa", fontSize: "11px", display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ color: "#ff8c00", fontSize: "10px" }}>&#10003;</span>
                      {feature}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                <button
                  onClick={handleBuy}
                  style={{
                    background: "#ff8c00", border: "none", color: "#0a0a0a",
                    fontSize: "12px", fontFamily: MONO, cursor: "pointer",
                    padding: "10px 16px", fontWeight: "bold", letterSpacing: "0.5px",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#ffa040"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#ff8c00"; }}
                >
                  BUY LICENSE — $29
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ flex: 1, height: "1px", background: "#2a2a2a" }} />
                  <span style={{ color: "#555", fontSize: "10px" }}>or</span>
                  <div style={{ flex: 1, height: "1px", background: "#2a2a2a" }} />
                </div>

                {showKeyInput ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <input
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder="CG-XXXXX-XXXXX-XXXXX-XXXXX"
                      onKeyDown={(e) => { if (e.key === "Enter") handleActivate(); }}
                      style={{
                        width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0",
                        fontSize: "12px", fontFamily: MONO, padding: "8px 10px", outline: "none", boxSizing: "border-box",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                      autoFocus
                    />
                    {error && <div style={{ color: "#ff4444", fontSize: "11px" }}>{error}</div>}
                    <button
                      onClick={handleActivate}
                      disabled={!key.trim() || activating}
                      style={{
                        background: key.trim() ? "#ff8c00" : "#2a2a2a", border: "none",
                        color: key.trim() ? "#0a0a0a" : "#555",
                        fontSize: "11px", fontFamily: MONO, cursor: key.trim() && !activating ? "pointer" : "default",
                        padding: "8px 16px", fontWeight: "bold", alignSelf: "flex-start",
                        opacity: activating ? 0.7 : 1,
                      }}
                    >
                      {activating ? "ACTIVATING..." : "ACTIVATE"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowKeyInput(true)}
                    style={{
                      background: "transparent", border: "1px solid #2a2a2a", color: "#888",
                      fontSize: "11px", fontFamily: MONO, cursor: "pointer", padding: "8px 16px",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#555"; e.currentTarget.style.color = "#ccc"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#888"; }}
                  >
                    I ALREADY HAVE A LICENSE KEY
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
