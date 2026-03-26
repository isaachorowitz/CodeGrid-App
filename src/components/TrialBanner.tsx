import { memo } from "react";
import { useLicenseStore } from "../stores/licenseStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";

export const TrialBanner = memo(function TrialBanner() {
  const status = useLicenseStore((s) => s.status);
  const loading = useLicenseStore((s) => s.loading);
  const setLicenseDialogOpen = useWorkspaceStore((s) => s.setLicenseDialogOpen);

  // Don't render if loading, no status, or fully licensed (and not in offline grace)
  if (loading || !status || status.is_licensed) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: MONO, fontSize: "10px" }}>
      <span
        style={{
          background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#666666",
          padding: "3px 6px", fontFamily: MONO, fontSize: "10px", whiteSpace: "nowrap",
        }}
      >
        Free · {status.max_panes} sessions
      </span>
      <button
        onClick={() => setLicenseDialogOpen(true)}
        style={{
          background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#ff8c00",
          padding: "3px 6px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#ffa040"; e.currentTarget.style.borderColor = "#ff8c00"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#ff8c00"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
      >
        UPGRADE
      </button>
    </div>
  );
});
