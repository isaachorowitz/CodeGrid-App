import { memo, useState, useEffect, useCallback } from "react";
import { useAppStore } from "../stores/appStore";
import { useToastStore } from "../stores/toastStore";
import type { SessionWithModel } from "../stores/sessionStore";
import { gitPush, gitPull } from "../lib/ipc";

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

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-6": "#d500f9",
  "claude-sonnet-4-6": "#ff8c00",
  "claude-haiku-4-5": "#00e5ff",
};

const MODEL_SHORT: Record<string, string> = {
  "claude-opus-4-6": "OPUS",
  "claude-sonnet-4-6": "SONNET",
  "claude-haiku-4-5": "HAIKU",
};

export const StatusBar = memo(function StatusBar({ session }: StatusBarProps) {
  const [uptime, setUptime] = useState(formatUptime(session.created_at));
  const addToast = useToastStore((s) => s.addToast);
  const setGitManagerOpen = useAppStore((s) => s.setGitManagerOpen);

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
  const statusLabel = STATUS_LABELS[session.status] ?? "UNKNOWN";
  const modelColor = MODEL_COLORS[session.model ?? ""] ?? "#888888";
  const modelShort = MODEL_SHORT[session.model ?? ""] ?? "";
  const isClaude = session.command?.includes("claude");

  return (
    <div
      style={{
        height: "22px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "0 8px",
        fontFamily: "'SF Mono', 'Menlo', monospace",
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
      {isClaude && modelShort && (
        <span
          style={{
            color: modelColor,
            fontSize: "9px",
            fontWeight: "bold",
            letterSpacing: "0.5px",
            padding: "0 3px",
            border: `1px solid ${modelColor}44`,
            background: `${modelColor}11`,
          }}
        >
          {modelShort}
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
              fontSize: "8px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
              padding: "0 3px", lineHeight: "14px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#4a9eff")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
          >
            PULL
          </button>
          <button
            onClick={handleQuickPush}
            title="Quick Push"
            style={{
              background: "none", border: "1px solid #2a2a2a", color: "#00c853",
              fontSize: "8px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
              padding: "0 3px", lineHeight: "14px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00c853")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
          >
            PUSH
          </button>
        </>
      )}
      <span style={{ marginLeft: "auto" }}>
        {uptime}
      </span>
    </div>
  );
});
