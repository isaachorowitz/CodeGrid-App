import { memo } from "react";
import { useLicenseStore } from "../stores/licenseStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";

export const TrialBanner = memo(function TrialBanner() {
  const status = useLicenseStore((s) => s.status);
  const loading = useLicenseStore((s) => s.loading);
  const setLicenseDialogOpen = useWorkspaceStore((s) => s.setLicenseDialogOpen);

  // Don't render if loading, no status, or fully licensed
  if (loading || !status || (status.is_licensed && !status.is_trial)) return null;

  const expired = status.is_trial && status.trial_days_remaining <= 0;

  return (
    <div
      style={{
        margin: "8px 12px 0 12px",
        padding: "6px 14px",
        background: "#1a1a1a",
        border: "1px solid #2a2a2a",
        borderRadius: "6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        fontFamily: MONO,
        fontSize: "11px",
        color: "#888888",
        flexShrink: 0,
      }}
    >
      {expired ? (
        <span>Trial expired — {status.max_panes} pane limit —</span>
      ) : (
        <span>Trial: {status.trial_days_remaining} day{status.trial_days_remaining !== 1 ? "s" : ""} remaining —</span>
      )}
      <button
        onClick={() => setLicenseDialogOpen(true)}
        style={{
          background: "none",
          border: "none",
          color: "#ff8c00",
          fontSize: "11px",
          fontFamily: MONO,
          cursor: "pointer",
          padding: 0,
          textDecoration: "underline",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#ffa040"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#ff8c00"; }}
      >
        Activate License
      </button>
    </div>
  );
});
