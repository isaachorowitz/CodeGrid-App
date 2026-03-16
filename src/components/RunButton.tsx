import { memo, useCallback, useState } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useToastStore } from "../stores/toastStore";
import { sendToSession } from "../lib/ipc";

const COMMON_PORTS = new Set([3000, 3001, 4000, 4200, 5000, 5173, 5174, 8000, 8080, 8081, 8443, 8888, 9000]);

function generateRandomPort(): number {
  let port: number;
  do {
    port = Math.floor(Math.random() * (9999 - 3000 + 1)) + 3000;
  } while (COMMON_PORTS.has(port));
  return port;
}

export const RunButton = memo(function RunButton() {
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId);
  const addToast = useToastStore((s) => s.addToast);
  const [runningPort, setRunningPort] = useState<number | null>(null);

  const handleRun = useCallback(async () => {
    if (!focusedSessionId) {
      addToast("No focused session", "warning");
      return;
    }
    const port = generateRandomPort();
    const message = `Run this project. Use port ${port} for the dev server. If the project has a dev server script (like npm run dev, cargo run, etc.), use that. Make sure to use port ${port} specifically since other ports may be in use.`;
    try {
      await sendToSession(focusedSessionId, message);
      setRunningPort(port);
      addToast(`Sent run command (port ${port})`, "success");
    } catch (e) {
      addToast(`Failed to send run command: ${e}`, "error");
    }
  }, [focusedSessionId, addToast]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <button
        onClick={handleRun}
        disabled={!focusedSessionId}
        title="Run the project dev server on a random port"
        style={{
          background: focusedSessionId ? "#00c853" : "#1e1e1e",
          border: `1px solid ${focusedSessionId ? "#00c853" : "#2a2a2a"}`,
          color: focusedSessionId ? "#0a0a0a" : "#333333",
          fontSize: "10px",
          fontWeight: "bold",
          fontFamily: "'SF Mono', 'Menlo', monospace",
          cursor: focusedSessionId ? "pointer" : "default",
          padding: "2px 8px",
          letterSpacing: "0.5px",
          opacity: focusedSessionId ? 1 : 0.4,
        }}
        onMouseEnter={(e) => {
          if (focusedSessionId) {
            e.currentTarget.style.background = "#00e676";
            e.currentTarget.style.borderColor = "#00e676";
          }
        }}
        onMouseLeave={(e) => {
          if (focusedSessionId) {
            e.currentTarget.style.background = "#00c853";
            e.currentTarget.style.borderColor = "#00c853";
          }
        }}
      >
        {"\u25B6"} RUN
      </button>
      {runningPort !== null && (
        <span
          style={{
            fontSize: "9px",
            fontFamily: "'SF Mono', 'Menlo', monospace",
            color: "#00c853",
            letterSpacing: "0.3px",
          }}
        >
          :{runningPort}
        </span>
      )}
    </div>
  );
});
