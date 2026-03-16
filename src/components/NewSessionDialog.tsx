import { memo, useState, useCallback, useRef, useEffect } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAppStore } from "../stores/appStore";
import { useToastStore } from "../stores/toastStore";

interface NewSessionDialogProps {
  onCreateSession: (workingDir: string, useWorktree: boolean, resume: boolean, isShell: boolean) => void;
}

function shortenPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

function folderName(path: string): string {
  return path.split("/").pop() || path;
}

export const NewSessionDialog = memo(function NewSessionDialog({
  onCreateSession,
}: NewSessionDialogProps) {
  const { newSessionDialogOpen, setNewSessionDialogOpen } = useWorkspaceStore();
  const recentDirs = useAppStore((s) => s.recentDirs);
  const [tab, setTab] = useState<"recent" | "browse" | "clone">("recent");
  const [path, setPath] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [useWorktree, setUseWorktree] = useState(true);
  const [resume, setResume] = useState(false);
  const [sessionType, setSessionType] = useState<"claude" | "shell">("claude");
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (newSessionDialogOpen) {
      setPath("");
      setCloneUrl("");
      setResume(false);
      setSessionType("claude");
      setFilter("");
      setTab(recentDirs.length > 0 ? "recent" : "browse");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [newSessionDialogOpen, recentDirs.length]);

  const handleSubmit = useCallback(
    (dir?: string) => {
      const finalDir = dir ?? (path.trim() || "~");
      onCreateSession(finalDir, useWorktree, resume, sessionType === "shell");
      setNewSessionDialogOpen(false);
    },
    [path, useWorktree, resume, sessionType, onCreateSession, setNewSessionDialogOpen],
  );

  const handleClone = useCallback(async () => {
    if (!cloneUrl.trim()) return;
    try {
      const { cloneRepo } = await import("../lib/ipc");
      const clonedPath = await cloneRepo(cloneUrl.trim());
      onCreateSession(clonedPath, false, false, false);
      setNewSessionDialogOpen(false);
    } catch (e) {
      console.error("Clone failed:", e);
    }
  }, [cloneUrl, onCreateSession, setNewSessionDialogOpen]);

  const handleBrowse = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false, title: "Pick a folder" });
      if (selected) {
        setPath(selected as string);
        setTab("browse");
      }
    } catch {
      // Not in Tauri
    }
  }, []);

  const filteredDirs = filter
    ? recentDirs.filter((d) =>
        d.toLowerCase().includes(filter.toLowerCase()) ||
        folderName(d).toLowerCase().includes(filter.toLowerCase()),
      )
    : recentDirs;

  if (!newSessionDialogOpen) return null;

  const tabs = [
    { id: "recent" as const, label: "Recent Projects", count: recentDirs.length },
    { id: "browse" as const, label: "Browse Folder" },
    { id: "clone" as const, label: "Clone Repo" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        paddingTop: "60px",
      }}
      onClick={() => setNewSessionDialogOpen(false)}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.6)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "560px",
          maxHeight: "540px",
          background: "#141414",
          border: "1px solid #ff8c00",
          fontFamily: "'SF Mono', 'Menlo', monospace",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a2a" }}>
          <div style={{ color: "#ff8c00", fontSize: "13px", fontWeight: "bold", letterSpacing: "1px" }}>
            START A NEW SESSION
          </div>
          <div style={{ color: "#555555", fontSize: "10px", marginTop: "4px" }}>
            Pick a project and start coding with Claude
          </div>
        </div>

        {/* Session type selector — big friendly buttons */}
        <div style={{ display: "flex", gap: "1px", padding: "8px 16px" }}>
          {(["claude", "shell"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setSessionType(type)}
              style={{
                flex: 1,
                padding: "10px",
                background: sessionType === type ? (type === "claude" ? "#ff8c0022" : "#4a9eff22") : "#1e1e1e",
                border: `1px solid ${sessionType === type ? (type === "claude" ? "#ff8c00" : "#4a9eff") : "#2a2a2a"}`,
                color: sessionType === type ? (type === "claude" ? "#ff8c00" : "#4a9eff") : "#888888",
                fontSize: "12px",
                fontFamily: "'SF Mono', monospace",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: "2px" }}>
                {type === "claude" ? "Claude Code" : "Terminal Shell"}
              </div>
              <div style={{ fontSize: "9px", opacity: 0.7 }}>
                {type === "claude" ? "AI pair programmer" : "Regular terminal"}
              </div>
            </button>
          ))}
        </div>

        {/* Tab navigation */}
        <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "8px",
                background: tab === t.id ? "#1e1e1e" : "transparent",
                border: "none",
                borderBottom: tab === t.id ? "2px solid #ff8c00" : "2px solid transparent",
                color: tab === t.id ? "#ff8c00" : "#555555",
                fontSize: "10px",
                fontFamily: "'SF Mono', monospace",
                cursor: "pointer",
                letterSpacing: "0.5px",
              }}
            >
              {t.label}
              {t.count !== undefined && (
                <span style={{ marginLeft: "4px", opacity: 0.5 }}>({t.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* Recent Projects */}
          {tab === "recent" && (
            <div>
              <div style={{ padding: "8px 16px" }}>
                <input
                  ref={inputRef}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter projects..."
                  style={{
                    width: "100%",
                    background: "#0a0a0a",
                    border: "1px solid #2a2a2a",
                    color: "#e0e0e0",
                    fontSize: "12px",
                    fontFamily: "'SF Mono', monospace",
                    padding: "8px",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#ff8c00")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                />
              </div>
              {filteredDirs.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#555555", fontSize: "11px" }}>
                  {recentDirs.length === 0
                    ? "No projects found on your computer. Try Browse or Clone."
                    : "No projects match your filter"}
                </div>
              ) : (
                filteredDirs.map((dir) => (
                  <div
                    key={dir}
                    onClick={() => handleSubmit(dir)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "10px 16px",
                      cursor: "pointer",
                      gap: "12px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#1e1e1e")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        background: "#1e1e1e",
                        border: "1px solid #2a2a2a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "14px",
                        color: "#ff8c00",
                        fontWeight: "bold",
                        flexShrink: 0,
                      }}
                    >
                      {folderName(dir)[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ color: "#e0e0e0", fontSize: "12px", fontWeight: "bold" }}>
                        {folderName(dir)}
                      </div>
                      <div
                        style={{
                          color: "#555555",
                          fontSize: "10px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {shortenPath(dir)}
                      </div>
                    </div>
                    <div
                      style={{
                        color: "#ff8c00",
                        fontSize: "10px",
                        fontWeight: "bold",
                        padding: "4px 8px",
                        border: "1px solid #ff8c00",
                        flexShrink: 0,
                      }}
                    >
                      OPEN
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Browse folder */}
          {tab === "browse" && (
            <div style={{ padding: "16px" }}>
              <div style={{ color: "#888888", fontSize: "10px", marginBottom: "6px", letterSpacing: "0.5px" }}>
                FOLDER PATH
              </div>
              <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
                <input
                  ref={tab === "browse" ? inputRef : undefined}
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="~/projects/my-app"
                  style={{
                    flex: 1,
                    background: "#0a0a0a",
                    border: "1px solid #2a2a2a",
                    color: "#e0e0e0",
                    fontSize: "13px",
                    fontFamily: "'SF Mono', monospace",
                    padding: "10px",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#ff8c00")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                  }}
                />
                <button
                  onClick={handleBrowse}
                  style={{
                    background: "#1e1e1e",
                    border: "1px solid #2a2a2a",
                    color: "#888888",
                    fontSize: "12px",
                    fontFamily: "'SF Mono', monospace",
                    cursor: "pointer",
                    padding: "10px 16px",
                    fontWeight: "bold",
                  }}
                >
                  BROWSE
                </button>
              </div>

              {sessionType === "claude" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#888888", fontSize: "11px", cursor: "pointer" }}>
                    <input type="checkbox" checked={useWorktree} onChange={(e) => setUseWorktree(e.target.checked)} style={{ accentColor: "#ff8c00" }} />
                    Auto-create git worktree (keeps sessions isolated)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#888888", fontSize: "11px", cursor: "pointer" }}>
                    <input type="checkbox" checked={resume} onChange={(e) => setResume(e.target.checked)} style={{ accentColor: "#ff8c00" }} />
                    Resume previous Claude session
                  </label>
                </div>
              )}

              <button
                onClick={() => handleSubmit()}
                style={{
                  width: "100%",
                  background: "#ff8c00",
                  border: "none",
                  color: "#0a0a0a",
                  fontSize: "12px",
                  fontFamily: "'SF Mono', monospace",
                  cursor: "pointer",
                  padding: "12px",
                  fontWeight: "bold",
                  letterSpacing: "1px",
                }}
              >
                START {sessionType === "claude" ? "CLAUDE" : "SHELL"} SESSION
              </button>
            </div>
          )}

          {/* Clone repo */}
          {tab === "clone" && (
            <div style={{ padding: "16px" }}>
              <div style={{ color: "#888888", fontSize: "10px", marginBottom: "6px", letterSpacing: "0.5px" }}>
                GIT REPOSITORY URL
              </div>
              <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
                <input
                  ref={tab === "clone" ? inputRef : undefined}
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  placeholder="https://github.com/user/repo"
                  style={{
                    flex: 1,
                    background: "#0a0a0a",
                    border: "1px solid #2a2a2a",
                    color: "#e0e0e0",
                    fontSize: "13px",
                    fontFamily: "'SF Mono', monospace",
                    padding: "10px",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#ff8c00")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleClone();
                  }}
                />
              </div>
              <div style={{ color: "#555555", fontSize: "10px", marginBottom: "16px" }}>
                Clones to ~/Projects/ and opens a Claude session automatically
              </div>
              <button
                onClick={handleClone}
                disabled={!cloneUrl.trim()}
                style={{
                  width: "100%",
                  background: cloneUrl.trim() ? "#ff8c00" : "#2a2a2a",
                  border: "none",
                  color: cloneUrl.trim() ? "#0a0a0a" : "#555555",
                  fontSize: "12px",
                  fontFamily: "'SF Mono', monospace",
                  cursor: cloneUrl.trim() ? "pointer" : "default",
                  padding: "12px",
                  fontWeight: "bold",
                  letterSpacing: "1px",
                }}
              >
                CLONE & START
              </button>

              {/* Quick hub link */}
              <button
                onClick={() => {
                  setNewSessionDialogOpen(false);
                  useAppStore.getState().setHubBrowserOpen(true);
                }}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "1px solid #2a2a2a",
                  color: "#888888",
                  fontSize: "11px",
                  fontFamily: "'SF Mono', monospace",
                  cursor: "pointer",
                  padding: "10px",
                  marginTop: "8px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#ff8c00";
                  e.currentTarget.style.color = "#ff8c00";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#2a2a2a";
                  e.currentTarget.style.color = "#888888";
                }}
              >
                Browse Featured Repos in Hub
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
