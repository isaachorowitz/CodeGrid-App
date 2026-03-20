import { memo, useState, useCallback } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useLicenseStore } from "../stores/licenseStore";

const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";

function maskKey(key: string): string {
  if (key.length <= 8) return key;
  return key.slice(0, 4) + "-****-****-" + key.slice(-4);
}

export const LicenseDialog = memo(function LicenseDialog() {
  const { licenseDialogOpen, setLicenseDialogOpen } = useWorkspaceStore();
  const { status, error, activate, deactivate } = useLicenseStore();
  const [key, setKey] = useState("");
  const [activating, setActivating] = useState(false);

  const handleActivate = useCallback(async () => {
    if (!key.trim()) return;
    setActivating(true);
    const success = await activate(key.trim());
    setActivating(false);
    if (success) {
      setKey("");
      setLicenseDialogOpen(false);
    }
  }, [key, activate, setLicenseDialogOpen]);

  const handleDeactivate = useCallback(async () => {
    await deactivate();
  }, [deactivate]);

  if (!licenseDialogOpen) return null;

  const isLicensed = status?.is_licensed && !status?.is_trial;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", justifyContent: "center", paddingTop: "80px" }}
      onClick={() => setLicenseDialogOpen(false)}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.6)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Activate CodeGrid"
        style={{
          position: "relative", width: "420px", maxHeight: "400px", background: "#141414",
          border: "1px solid #ff8c00", fontFamily: MONO, zIndex: 1,
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a2a", color: "#ff8c00", fontSize: "12px", fontWeight: "bold", letterSpacing: "1px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          ACTIVATE CODEGRID
          <button onClick={() => setLicenseDialogOpen(false)} aria-label="Close" style={{ background: "none", border: "none", color: "#555555", fontSize: "14px", cursor: "pointer", fontFamily: MONO }}>x</button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {isLicensed ? (
            <>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>LICENSE KEY</div>
                <div style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "12px", fontFamily: MONO, padding: "8px 10px" }}>
                  {status.license_key ? maskKey(status.license_key) : "Active"}
                </div>
              </div>
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>STATUS</div>
                <div style={{ color: "#00c853", fontSize: "11px" }}>Licensed — unlimited panes</div>
              </div>
              <button
                onClick={handleDeactivate}
                style={{
                  background: "transparent", border: "1px solid #2a2a2a", color: "#888888",
                  fontSize: "11px", fontFamily: MONO, cursor: "pointer", padding: "6px 16px",
                  alignSelf: "flex-start",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff4444"; e.currentTarget.style.color = "#ff4444"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#888888"; }}
              >
                DEACTIVATE
              </button>
            </>
          ) : (
            <>
              {status?.is_trial && (
                <div style={{ color: "#888888", fontSize: "11px", lineHeight: "1.5" }}>
                  {status.trial_days_remaining > 0
                    ? `Trial active — ${status.trial_days_remaining} day${status.trial_days_remaining !== 1 ? "s" : ""} remaining (${status.max_panes} pane limit)`
                    : `Trial expired — limited to ${status.max_panes} panes`}
                </div>
              )}
              <div>
                <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>LICENSE KEY</div>
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  onKeyDown={(e) => { if (e.key === "Enter") handleActivate(); }}
                  style={{
                    width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0",
                    fontSize: "12px", fontFamily: MONO, padding: "8px 10px", outline: "none", boxSizing: "border-box",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                  autoFocus
                />
              </div>
              {error && (
                <div style={{ color: "#ff4444", fontSize: "11px" }}>{error}</div>
              )}
              <button
                onClick={handleActivate}
                disabled={!key.trim() || activating}
                style={{
                  background: key.trim() ? "#ff8c00" : "#2a2a2a", border: "1px solid #ff8c00",
                  color: key.trim() ? "#0a0a0a" : "#555555",
                  fontSize: "11px", fontFamily: MONO, cursor: key.trim() && !activating ? "pointer" : "default",
                  padding: "6px 16px", fontWeight: "bold", alignSelf: "flex-start",
                  opacity: activating ? 0.7 : 1,
                }}
              >
                {activating ? "ACTIVATING..." : "ACTIVATE"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
