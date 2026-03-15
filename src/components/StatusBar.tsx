import { memo, useState, useEffect } from "react";
import type { SessionInfo } from "../lib/ipc";

interface StatusBarProps {
  session: SessionInfo;
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

  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(formatUptime(session.created_at));
    }, 30000);
    return () => clearInterval(interval);
  }, [session.created_at]);

  const statusColor = STATUS_COLORS[session.status] ?? "#555555";
  const statusLabel = STATUS_LABELS[session.status] ?? "UNKNOWN";

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
      <span
        style={{
          color: "#ff8c00",
          fontWeight: "bold",
          minWidth: "16px",
        }}
      >
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
      <span style={{ color: "#e0e0e0" }}>
        {shortenPath(session.working_dir)}
      </span>
      {session.git_branch && (
        <span style={{ color: "#d500f9" }}>
          ({session.git_branch})
        </span>
      )}
      <span style={{ marginLeft: "auto" }}>
        {uptime}
      </span>
    </div>
  );
});
