import { memo, useState, useCallback } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useLicenseStore } from "../stores/licenseStore";
import { open } from "@tauri-apps/plugin-shell";

const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";
const PURCHASE_URL = "https://codegrid.app/pricing";
const PORTAL_URL = "https://keyforge.dev/portal/request";

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

  const handlePortal = useCallback(() => {
    open(PORTAL_URL);
  }, []);

  if (!licenseDialogOpen) return null;

  const isLicensed = status?.is_licensed;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "60px", paddingBottom: "40px", overflow: "auto" }}
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
          display: "flex", flexDirection: "column", flexShrink: 0,
        }}
      >
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #2a2a2a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#ff8c00", fontSize: "12px", fontWeight: "bold", letterSpacing: "1px" }}>
            {isLicensed ? "CODEGRID PRO" : "UPGRADE TO PRO"}
          </span>
          <button
            onClick={() => { setLicenseDialogOpen(false); setShowKeyInput(false); }}
            aria-label="Close"
            style={{ background: "none", border: "none", color: "#555555", fontSize: "14px", cursor: "pointer", fontFamily: MONO }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {isLicensed ? (
            /* ── Pro / Licensed view ── */
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#00c853", fontSize: "11px" }}>●</span>
                <span style={{ color: "#00c853", fontSize: "12px", fontWeight: "bold" }}>
                  Pro{status?.is_offline_grace ? " (offline — reconnect to validate)" : ""}
                </span>
              </div>

              <div>
                <div style={{ color: "#555", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>LICENSE KEY</div>
                <div style={{ background: "#0a0a0a", border: "1px solid #1e1e1e", color: "#888", fontSize: "12px", fontFamily: MONO, padding: "8px 10px" }}>
                  {status?.license_key ?? "Active"}
                </div>
              </div>

              {status?.subscription_expires_at && (
                <div style={{ color: "#666", fontSize: "11px" }}>
                  Renews · {new Date(status.subscription_expires_at).toLocaleDateString()}
                </div>
              )}

              <div style={{ color: "#888", fontSize: "11px", lineHeight: "1.6" }}>
                Up to 50 sessions · All features unlocked.
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  onClick={handlePortal}
                  style={{
                    background: "transparent", border: "1px solid #2a2a2a", color: "#888",
                    fontSize: "10px", fontFamily: MONO, cursor: "pointer", padding: "5px 14px",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; e.currentTarget.style.color = "#ff8c00"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#888"; }}
                >
                  MANAGE SUBSCRIPTION
                </button>
                <button
                  onClick={handleDeactivate}
                  style={{
                    background: "transparent", border: "1px solid #2a2a2a", color: "#555",
                    fontSize: "10px", fontFamily: MONO, cursor: "pointer", padding: "5px 14px",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff4444"; e.currentTarget.style.color = "#ff4444"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#555"; }}
                >
                  DEACTIVATE ON THIS DEVICE
                </button>
              </div>
            </>
          ) : (
            /* ── Free / Unlicensed view ── */
            <>
              {/* Free tier notice */}
              <div style={{ background: "#111", border: "1px solid #2a2a2a", padding: "10px 12px", fontSize: "11px", color: "#888", lineHeight: "1.6" }}>
                Free plan · {status?.max_panes ?? 3} session limit · All 5 agents included.
              </div>

              {/* What you get with Pro */}
              <div>
                <div style={{ color: "#e0e0e0", fontSize: "12px", fontWeight: "bold", marginBottom: "10px" }}>
                  CodeGrid Pro
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    "Up to 50 simultaneous sessions",
                    "All layout presets (Columns, Rows, Grid)",
                    "Attention detection across all sessions",
                    "Git manager + worktree isolation",
                    "GitHub repo browser",
                    "MCP server management",
                  ].map((f) => (
                    <div key={f} style={{ color: "#aaa", fontSize: "11px", display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ color: "#ff8c00", fontSize: "10px" }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Pricing */}
              <div style={{ color: "#555", fontSize: "10px", lineHeight: "1.8", borderTop: "1px solid #1e1e1e", paddingTop: "12px" }}>
                <span style={{ color: "#ff8c00", fontSize: "13px", fontWeight: "bold" }}>$7.99</span>
                <span style={{ color: "#555" }}> /month &nbsp;·&nbsp; </span>
                <span style={{ color: "#e0e0e0", fontSize: "13px", fontWeight: "bold" }}>$79</span>
                <span style={{ color: "#555" }}> /year </span>
                <span style={{ color: "#00c853", fontSize: "10px" }}>(save 17%)</span>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
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
                  GET PRO — FROM $7.99/MO
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ flex: 1, height: "1px", background: "#2a2a2a" }} />
                  <span style={{ color: "#555", fontSize: "10px" }}>already subscribed?</span>
                  <div style={{ flex: 1, height: "1px", background: "#2a2a2a" }} />
                </div>

                {showKeyInput ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <input
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
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
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={handleActivate}
                        disabled={!key.trim() || activating}
                        style={{
                          background: key.trim() ? "#ff8c00" : "#2a2a2a", border: "none",
                          color: key.trim() ? "#0a0a0a" : "#555",
                          fontSize: "11px", fontFamily: MONO,
                          cursor: key.trim() && !activating ? "pointer" : "default",
                          padding: "8px 16px", fontWeight: "bold",
                          opacity: activating ? 0.7 : 1,
                        }}
                      >
                        {activating ? "ACTIVATING..." : "ACTIVATE"}
                      </button>
                      <button
                        onClick={() => setShowKeyInput(false)}
                        style={{
                          background: "transparent", border: "1px solid #2a2a2a", color: "#555",
                          fontSize: "11px", fontFamily: MONO, cursor: "pointer", padding: "8px 12px",
                        }}
                      >
                        CANCEL
                      </button>
                    </div>
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
                    ENTER LICENSE KEY
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
