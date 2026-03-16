import { memo, useState, useEffect, useCallback } from "react";
import { useAppStore } from "../stores/appStore";
import { useToastStore } from "../stores/toastStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { SessionWithModel } from "../stores/sessionStore";
import { gitPush, gitPull } from "../lib/ipc";
import { vibeLabel } from "../lib/vibeMode";

interface StatusBarProps {
  session: SessionWithModel;
}

function shortenPath(path: string): string {
  const home = "~";
  const shortened = path.replace(/^\/Users\/[^/]+/, home).replace(/^\/home\/[^/]+/, home);
  const parts = shortened.split("/");
  if (parts.length > 3) {
    return parts[0] + "/.../" + parts.slice(-2).join("/");
  }
  return shortened;
}

function formatUptime(createdAt: string): string {
  const start = new Date(createdAt).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - start) / 1000);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}h${remainMin}m`;
}

const STATUS_COLORS: Record<string, string> = {
  idle: "#4a9eff",
  running: "#00c853",
  waiting: "#ffab00",
  error: "#ff3d00",
  dead: "#555555",
};

const STATUS_LABELS: Record<string, string> = {
  idle: "IDLE",
  running: "RUNNING",
  waiting: "WAITING",
  error: "ERROR",
  dead: "DEAD",
};

export const StatusBar = memo(function StatusBar({ session }: StatusBarProps) {
  const [uptime, setUptime] = useState(formatUptime(session.created_at));
  const addToast = useToastStore((s) => s.addToast);
  const setGitManagerOpen = useAppStore((s) => s.setGitManagerOpen);
  const vibeMode = useWorkspaceStore((s) => s.vibeMode);

  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(formatUptime(session.created_at));
    }, 30000);
    return () => clearInterval(interval);
  }, [session.created_at]);

  const handleQuickPush = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await gitPush(session.working_dir, false);
      addToast("Pushed", "success");
    } catch (err) {
      addToast(`Push failed: ${err}`, "error");
    }
  }, [session.working_dir, addToast]);

  const handleQuickPull = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await gitPull(session.working_dir);
      addToast("Pulled", "success");
    } catch (err) {
      addToast(`Pull failed: ${err}`, "error");
    }
  }, [session.working_dir, addToast]);

  const statusColor = STATUS_COLORS[session.status] ?? "#555555";
  const rawLabel = STATUS_LABELS[session.status] ?? "UNKNOWN";
  const statusLabel = vibeLabel(rawLabel, vibeMode);

  return (
    <div
      style={{
        height: "22px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "0 8px",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
        fontSize: "11px",
        color: "#888888",
        background: "#141414",
        borderTop: "1px solid #2a2a2a",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      <span style={{ color: "#ff8c00", fontWeight: "bold", minWidth: "16px" }}>
        [{session.pane_number}]
      </span>
      <span
        style={{
          color: statusColor,
          fontWeight: "bold",
          fontSize: "10px",
          letterSpacing: "0.5px",
        }}
      >
        {statusLabel}
      </span>
      {/* Activity name badge */}
      {session.activityName && (
        <span
          style={{
            color: "#ff8c00",
            fontSize: "9px",
            fontWeight: "bold",
            letterSpacing: "0.5px",
            padding: "0 3px",
            border: "1px solid #ff8c0044",
            background: "#ff8c0011",
          }}
        >
          {session.activityName.toUpperCase()}
        </span>
      )}
      <span style={{ color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {shortenPath(session.working_dir)}
      </span>
      {session.git_branch && (
        <>
          <span
            style={{ color: "#d500f9", cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); setGitManagerOpen(true, session.working_dir); }}
            title="Open Git Manager"
          >
            ({session.git_branch})
          </span>
          {/* Quick git buttons */}
          <button
            onClick={handleQuickPull}
            title="Quick Pull"
            style={{
              background: "none", border: "1px solid #2a2a2a", color: "#4a9eff",
              fontSize: "8px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
              padding: "0 3px", lineHeight: "14px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#4a9eff")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
          >
            {vibeLabel("PULL", vibeMode)}
          </button>
          <button
            onClick={handleQuickPush}
            title="Quick Push"
            style={{
              background: "none", border: "1px solid #2a2a2a", color: "#00c853",
              fontSize: "8px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
              padding: "0 3px", lineHeight: "14px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00c853")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
          >
            {vibeLabel("PUSH", vibeMode)}
          </button>
        </>
      )}
      <span style={{ marginLeft: "auto" }}>
        {uptime}
      </span>
    </div>
  );
});
