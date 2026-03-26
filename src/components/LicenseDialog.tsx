import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useLicenseStore } from "../stores/licenseStore";

interface LicenseDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const PORTAL_URL = "https://keyforge.dev/portal/request";
const PRICING_URL = "https://codegrid.app/pricing";

export function LicenseDialog({ isOpen, onClose }: LicenseDialogProps) {
  const { status, loading, error, activate, deactivate, refresh } = useLicenseStore();
  const [keyInput, setKeyInput] = useState("");
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);

  if (!isOpen) return null;

  const handleActivate = async () => {
    if (!keyInput.trim()) return;
    setActivating(true);
    setLocalError(null);
    const ok = await activate(keyInput.trim());
    setActivating(false);
    if (ok) {
      setKeyInput("");
      setShowKeyInput(false);
      onClose();
    } else {
      setLocalError(error || "Invalid key. Check and try again.");
    }
  };

  const handleDeactivate = async () => {
    setDeactivating(true);
    await deactivate();
    setDeactivating(false);
  };

  const handleRefresh = async () => {
    await refresh();
  };

  const isPro = status?.is_licensed;
  const isTrial = !isPro && status?.is_trial;
  const isFree = !isPro && !isTrial;

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 10000,
    background: "rgba(0,0,0,0.7)", display: "flex",
    alignItems: "center", justifyContent: "center",
  };

  const dialog: React.CSSProperties = {
    background: "#111", border: "1px solid #2a2a2a", borderRadius: "12px",
    width: "400px", maxWidth: "90vw", padding: "24px",
    fontFamily: "var(--font-jetbrains, monospace)", color: "#e0e0e0",
    boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={dialog}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.05em", color: "#fff" }}>
            {isPro ? "CodeGrid Pro" : "Upgrade to Pro"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}>×</button>
        </div>

        {loading ? (
          <div style={{ color: "#555", fontSize: "12px", textAlign: "center", padding: "20px 0" }}>Loading…</div>
        ) : isPro ? (
          /* ── PRO VIEW ── */
          <div>
            <div style={{ background: "#0a2a0a", border: "1px solid #1a4a1a", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", color: "#4ade80", marginBottom: "4px" }}>ACTIVE</div>
              {status?.license_key && (
                <div style={{ fontSize: "11px", color: "#666", fontFamily: "monospace", wordBreak: "break-all" }}>{status.license_key}</div>
              )}
            </div>

            {status?.subscription_expires_at && (
              <div style={{ fontSize: "11px", color: "#555", marginBottom: "8px" }}>
                Renews {new Date(status.subscription_expires_at).toLocaleDateString()}
              </div>
            )}

            {status?.is_offline_grace && (
              <div style={{ background: "#2a1a00", border: "1px solid #4a3000", borderRadius: "6px", padding: "8px 12px", marginBottom: "12px", fontSize: "11px", color: "#f59e0b" }}>
                Offline mode — validation cached. Connect to internet to verify.
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button
                onClick={() => open(PORTAL_URL)}
                style={{ flex: 1, background: "#1a1a1a", border: "1px solid #333", borderRadius: "6px", padding: "8px", fontSize: "11px", color: "#ccc", cursor: "pointer" }}
              >
                Manage Subscription
              </button>
              <button
                onClick={handleRefresh}
                style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: "6px", padding: "8px 12px", fontSize: "11px", color: "#666", cursor: "pointer" }}
              >
                ↻
              </button>
              <button
                onClick={handleDeactivate}
                disabled={deactivating}
                style={{ background: "none", border: "1px solid #3a1a1a", borderRadius: "6px", padding: "8px 12px", fontSize: "11px", color: "#c53030", cursor: "pointer" }}
              >
                {deactivating ? "…" : "Deactivate"}
              </button>
            </div>
          </div>
        ) : (
          /* ── FREE / TRIAL VIEW ── */
          <div>
            {/* Status badge */}
            {isTrial ? (
              <div style={{ background: "#2a1f00", border: "1px solid #4a3800", borderRadius: "6px", padding: "8px 12px", marginBottom: "16px", fontSize: "11px", color: "#f59e0b" }}>
                Trial · {status?.trial_days_remaining ?? 0}d left — full Pro access
              </div>
            ) : (
              <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "8px 12px", marginBottom: "16px", fontSize: "11px", color: "#666" }}>
                Free tier · {status?.max_panes ?? 3} session limit
              </div>
            )}

            {/* Pricing */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <div style={{ flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff" }}>$7.99</div>
                <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>/month</div>
              </div>
              <div style={{ flex: 1, background: "#1a1a1a", border: "1px solid #3a3a1a", borderRadius: "8px", padding: "12px", textAlign: "center", position: "relative" }}>
                <div style={{ position: "absolute", top: "-8px", left: "50%", transform: "translateX(-50%)", background: "#a16207", color: "#fef08a", fontSize: "9px", padding: "2px 6px", borderRadius: "4px", fontWeight: 700, whiteSpace: "nowrap" }}>SAVE 49%</div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff" }}>$49</div>
                <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>/year</div>
              </div>
            </div>

            {/* Features */}
            <div style={{ marginBottom: "16px" }}>
              {["Up to 50 sessions", "Quick Actions AI prompts", "Priority app updates", "Everything in Free"].map(f => (
                <div key={f} style={{ fontSize: "11px", color: "#888", padding: "3px 0", display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ color: "#4ade80" }}>✓</span> {f}
                </div>
              ))}
            </div>

            {/* CTA */}
            {!showKeyInput ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button
                  onClick={() => open(PRICING_URL)}
                  style={{ width: "100%", background: "#fff", color: "#000", border: "none", borderRadius: "6px", padding: "10px", fontSize: "12px", fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}
                >
                  GET PRO →
                </button>
                <button
                  onClick={() => setShowKeyInput(true)}
                  style={{ width: "100%", background: "none", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "8px", fontSize: "11px", color: "#666", cursor: "pointer" }}
                >
                  I already have a key
                </button>
              </div>
            ) : (
              <div>
                <input
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleActivate()}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                  style={{ width: "100%", background: "#0a0a0a", border: "1px solid #333", borderRadius: "6px", padding: "8px 10px", fontSize: "11px", color: "#ccc", fontFamily: "monospace", boxSizing: "border-box", marginBottom: "6px", outline: "none" }}
                />
                {localError && (
                  <div style={{ fontSize: "10px", color: "#c53030", marginBottom: "6px" }}>{localError}</div>
                )}
                <span
                  onClick={() => open(PORTAL_URL)}
                  style={{ fontSize: "10px", color: "#555", textDecoration: "underline", cursor: "pointer", display: "block", marginBottom: "10px" }}
                >
                  Find your license key →
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleActivate}
                    disabled={activating || !keyInput.trim()}
                    style={{ flex: 1, background: activating ? "#333" : "#fff", color: "#000", border: "none", borderRadius: "6px", padding: "8px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                  >
                    {activating ? "Activating…" : "Activate"}
                  </button>
                  <button
                    onClick={() => { setShowKeyInput(false); setLocalError(null); setKeyInput(""); }}
                    style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "8px 12px", fontSize: "11px", color: "#666", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LicenseDialog;
