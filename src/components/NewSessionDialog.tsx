import { memo, useState, useCallback, useRef, useEffect } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";

interface NewSessionDialogProps {
  onCreateSession: (workingDir: string, useWorktree: boolean, resume: boolean, isShell: boolean) => void;
}

export const NewSessionDialog = memo(function NewSessionDialog({
  onCreateSession,
}: NewSessionDialogProps) {
  const { newSessionDialogOpen, setNewSessionDialogOpen } = useWorkspaceStore();
  const [path, setPath] = useState("");
  const [useWorktree, setUseWorktree] = useState(true);
  const [resume, setResume] = useState(false);
  const [sessionType, setSessionType] = useState<"claude" | "shell">("claude");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (newSessionDialogOpen) {
      setPath("");
      setResume(false);
      setSessionType("claude");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [newSessionDialogOpen]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const dir = path.trim() || "~";
      // Tilde expansion happens on the backend; pass as-is or use /tmp as fallback
      const expandedDir = dir;
      onCreateSession(expandedDir, useWorktree, resume, sessionType === "shell");
      setNewSessionDialogOpen(false);
    },
    [path, useWorktree, resume, sessionType, onCreateSession, setNewSessionDialogOpen],
  );

  const handleBrowse = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Working Directory",
      });
      if (selected) {
        setPath(selected as string);
      }
    } catch {
      // Dialog not available (dev mode outside Tauri)
    }
  }, []);

  if (!newSessionDialogOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        paddingTop: "120px",
      }}
      onClick={() => setNewSessionDialogOpen(false)}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.6)",
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "480px",
          background: "#141414",
          border: "1px solid #ff8c00",
          fontFamily: "'SF Mono', 'Menlo', monospace",
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #2a2a2a",
            color: "#ff8c00",
            fontSize: "12px",
            fontWeight: "bold",
            letterSpacing: "1px",
          }}
        >
          NEW SESSION
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "16px" }}>
          {/* Session type */}
          <div style={{ marginBottom: "12px" }}>
            <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>
              TYPE
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              {(["claude", "shell"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSessionType(type)}
                  style={{
                    flex: 1,
                    padding: "6px",
                    background: sessionType === type ? "#1e1e1e" : "transparent",
                    border: `1px solid ${sessionType === type ? "#ff8c00" : "#2a2a2a"}`,
                    color: sessionType === type ? "#ff8c00" : "#888888",
                    fontSize: "11px",
                    fontFamily: "'SF Mono', monospace",
                    cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                >
                  {type === "claude" ? "Claude Code" : "Shell"}
                </button>
              ))}
            </div>
          </div>

          {/* Working directory */}
          <div style={{ marginBottom: "12px" }}>
            <div style={{ color: "#888888", fontSize: "10px", marginBottom: "4px", letterSpacing: "0.5px" }}>
              WORKING DIRECTORY
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              <input
                ref={inputRef}
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="~/projects/my-app"
                style={{
                  flex: 1,
                  background: "#0a0a0a",
                  border: "1px solid #2a2a2a",
                  color: "#e0e0e0",
                  fontSize: "12px",
                  fontFamily: "'SF Mono', monospace",
                  padding: "6px 8px",
                  outline: "none",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#ff8c00")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
              />
              <button
                type="button"
                onClick={handleBrowse}
                style={{
                  background: "#1e1e1e",
                  border: "1px solid #2a2a2a",
                  color: "#888888",
                  fontSize: "11px",
                  fontFamily: "'SF Mono', monospace",
                  cursor: "pointer",
                  padding: "6px 10px",
                }}
              >
                ...
              </button>
            </div>
          </div>

          {/* Options */}
          {sessionType === "claude" && (
            <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#888888",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={useWorktree}
                  onChange={(e) => setUseWorktree(e.target.checked)}
                  style={{ accentColor: "#ff8c00" }}
                />
                Auto-create worktree if repo is active
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#888888",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={resume}
                  onChange={(e) => setResume(e.target.checked)}
                  style={{ accentColor: "#ff8c00" }}
                />
                Resume last session (--resume)
              </label>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setNewSessionDialogOpen(false)}
              style={{
                background: "transparent",
                border: "1px solid #2a2a2a",
                color: "#888888",
                fontSize: "11px",
                fontFamily: "'SF Mono', monospace",
                cursor: "pointer",
                padding: "6px 16px",
              }}
            >
              CANCEL
            </button>
            <button
              type="submit"
              style={{
                background: "#ff8c00",
                border: "1px solid #ff8c00",
                color: "#0a0a0a",
                fontSize: "11px",
                fontFamily: "'SF Mono', monospace",
                cursor: "pointer",
                padding: "6px 16px",
                fontWeight: "bold",
              }}
            >
              CREATE
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});
