import { memo, useCallback } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useLicenseStore } from "../stores/licenseStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { sendToSession } from "../lib/ipc";

interface QuickAction {
  label: string;
  command: string;
  color: string;
  tooltip: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Review",   command: "/review",                                                    color: "#00c853", tooltip: "Review code changes in current project" },
  { label: "Fix Bug",  command: "Find and fix the most critical bug in this codebase",        color: "#ff3d00", tooltip: "Ask Claude to find and fix bugs" },
  { label: "Explain",  command: "Explain the architecture of this codebase at a high level", color: "#4a9eff", tooltip: "Get an overview of the project" },
  { label: "Test",     command: "Write tests for the untested code in this project",          color: "#ffab00", tooltip: "Generate tests for untested code" },
  { label: "Refactor", command: "Identify the messiest code and refactor it cleanly",        color: "#d500f9", tooltip: "Clean up messy code" },
  { label: "Docs",     command: "Add documentation to the public API of this project",       color: "#00e5ff", tooltip: "Generate documentation" },
];

const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";

interface QuickActionsProps {
  sessionId?: string;
}

export const QuickActions = memo(function QuickActions({ sessionId }: QuickActionsProps) {
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId);
  const licenseStatus = useLicenseStore((s) => s.status);
  const setLicenseDialogOpen = useWorkspaceStore((s) => s.setLicenseDialogOpen);
  const targetId = sessionId ?? focusedSessionId;

  // Pro feature: available during trial or with active subscription
  const isUnlocked = licenseStatus?.is_licensed || licenseStatus?.is_trial;

  const handleAction = useCallback(
    async (command: string) => {
      if (!isUnlocked) {
        setLicenseDialogOpen(true);
        return;
      }
      if (!targetId) return;
      try {
        await sendToSession(targetId, command);
      } catch (e) {
        console.warn("Failed to send quick action:", e);
      }
    },
    [targetId, isUnlocked, setLicenseDialogOpen],
  );

  return (
    <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
      <span
        style={{
          fontSize: "9px", color: isUnlocked ? "#e0e0e0" : "#444",
          fontFamily: MONO, marginRight: "2px", letterSpacing: "0.5px", fontWeight: "bold",
        }}
      >
        {isUnlocked ? "QUICK" : "QUICK ⬆"}
      </span>
      {QUICK_ACTIONS.map((action) => (
        <button
          key={action.label}
          onClick={() => handleAction(action.command)}
          title={isUnlocked ? action.tooltip : `Pro feature — upgrade to use ${action.label}`}
          style={{
            background: "#1e1e1e",
            border: `1px solid ${isUnlocked && targetId ? "#444444" : "#2a2a2a"}`,
            color: isUnlocked && targetId ? action.color : "#333333",
            fontSize: "9px", fontWeight: "bold", fontFamily: MONO,
            cursor: isUnlocked ? (targetId ? "pointer" : "default") : "pointer",
            padding: "2px 6px", letterSpacing: "0.3px",
            opacity: isUnlocked ? (targetId ? 1 : 0.4) : 0.35,
          }}
          onMouseEnter={(e) => {
            if (isUnlocked && targetId) {
              e.currentTarget.style.background = `${action.color}15`;
              e.currentTarget.style.borderColor = action.color;
            } else if (!isUnlocked) {
              e.currentTarget.style.borderColor = "#ff8c00";
              e.currentTarget.style.color = "#ff8c0088";
              e.currentTarget.style.opacity = "0.6";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#1e1e1e";
            e.currentTarget.style.borderColor = isUnlocked && targetId ? "#444444" : "#2a2a2a";
            e.currentTarget.style.color = isUnlocked && targetId ? action.color : "#333333";
            e.currentTarget.style.opacity = isUnlocked ? (targetId ? "1" : "0.4") : "0.35";
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
});
