import { memo, useState, useEffect, useCallback, useMemo } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSessionStore } from "../stores/sessionStore";
import { useAppStore } from "../stores/appStore";
import { useToastStore } from "../stores/toastStore";
import {
  gitStatus, gitPush, gitPull, gitStageFile, gitUnstageFile, gitCommit,
  gitDiffStat,
  type GitStatusInfo,
} from "../lib/ipc";
import { FileTree } from "./FileTree";

export const Sidebar = memo(function Sidebar() {
  const { workspaces, activeWorkspaceId, sidebarOpen } = useWorkspaceStore();
  const sessions = useSessionStore((s) => s.sessions);
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId);
  const { setSkillsPanelOpen, setHubBrowserOpen, setGitManagerOpen, setMcpManagerOpen, setClaudeMdEditorOpen, setGitSetupWizardOpen } = useAppStore();
  const addToast = useToastStore((s) => s.addToast);
  const [workspaceGitStatus, setWorkspaceGitStatus] = useState<GitStatusInfo | null>(null);
  const [filesOpen, setFilesOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(true);
  const [commitFormOpen, setCommitFormOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [pushLoading, setPushLoading] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeSessions = sessions.filter((s) => s.workspace_id === activeWorkspaceId);

  // Fetch git status for active workspace repo
  useEffect(() => {
    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
    if (!dir) { setWorkspaceGitStatus(null); return; }
    gitStatus(dir).then(setWorkspaceGitStatus).catch(() => setWorkspaceGitStatus(null));
    const interval = setInterval(() => {
      gitStatus(dir).then(setWorkspaceGitStatus).catch(() => setWorkspaceGitStatus(null));
    }, 15000);
    return () => clearInterval(interval);
  }, [activeWorkspace?.repo_path, activeSessions.length > 0 ? activeSessions[0]?.working_dir : null]);

  const handleQuickPush = useCallback(async () => {
    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
    if (!dir || pushLoading) return;
    if (!workspaceGitStatus?.has_remote) {
      addToast("No remote configured. Add one with: git remote add origin <url>", "warning", 5000);
      return;
    }
    setPushLoading(true);
    try {
      const aheadCount = workspaceGitStatus?.ahead ?? 0;
      const branch = workspaceGitStatus?.branch ?? "unknown";
      const result = await gitPush(dir, false);
      const detail = aheadCount > 0
        ? `Pushed ${aheadCount} commit${aheadCount > 1 ? "s" : ""} to origin/${branch}`
        : `Pushed to origin/${branch}`;
      addToast(result || detail, "success", 4000);
      const s = await gitStatus(dir);
      setWorkspaceGitStatus(s);
    } catch (e) {
      const errMsg = String(e).replace(/^Error:\s*/, "");
      addToast(`Push failed: ${errMsg}`, "error", 6000);
    } finally {
      setPushLoading(false);
    }
  }, [activeWorkspace, activeSessions, workspaceGitStatus, addToast, pushLoading]);

  const handleQuickPull = useCallback(async () => {
    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
    if (!dir || pullLoading) return;
    setPullLoading(true);
    try {
      const result = await gitPull(dir);
      const detail = result?.includes("Already up to date")
        ? "Already up to date"
        : result || "Pulled latest changes";
      addToast(detail, "success", 4000);
      const s = await gitStatus(dir);
      setWorkspaceGitStatus(s);
    } catch (e) {
      const errMsg = String(e).replace(/^Error:\s*/, "");
      addToast(`Pull failed: ${errMsg}`, "error", 6000);
    } finally {
      setPullLoading(false);
    }
  }, [activeWorkspace, activeSessions, addToast, pullLoading]);

  const refreshGitStatus = useCallback(async () => {
    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
    if (!dir) return;
    try {
      const s = await gitStatus(dir);
      setWorkspaceGitStatus(s);
    } catch {}
  }, [activeWorkspace, activeSessions]);

  const handleStageToggle = useCallback(async (filePath: string, isStaged: boolean) => {
    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
    if (!dir) return;
    try {
      if (isStaged) {
        await gitUnstageFile(dir, filePath);
      } else {
        await gitStageFile(dir, filePath);
      }
      await refreshGitStatus();
    } catch (e) { addToast(`Stage/unstage failed: ${e}`, "error"); }
  }, [activeWorkspace, activeSessions, refreshGitStatus, addToast]);

  const handleCommit = useCallback(async () => {
    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
    if (!dir || !commitMessage.trim()) return;
    try {
      await gitCommit(dir, commitMessage.trim());
      addToast("Committed successfully", "success");
      setCommitMessage("");
      setCommitFormOpen(false);
      await refreshGitStatus();
    } catch (e) { addToast(`Commit failed: ${e}`, "error"); }
  }, [activeWorkspace, activeSessions, commitMessage, refreshGitStatus, addToast]);

  const handleGenerateCommitMessage = useCallback(async () => {
    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
    if (!dir || !workspaceGitStatus) return;
    setAiGenerating(true);
    try {
      const diffStat = await gitDiffStat(dir);
      const allChanges = [
        ...workspaceGitStatus.staged.map((f) => ({ path: f.path, status: f.status })),
        ...workspaceGitStatus.unstaged.map((f) => ({ path: f.path, status: f.status })),
        ...workspaceGitStatus.untracked.map((p) => ({ path: p, status: "added" })),
      ];
      if (allChanges.length === 0) {
        setCommitMessage(`Changes ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
        return;
      }
      const paths = allChanges.map((c) => c.path.toLowerCase());
      const hasTests = paths.some((p) => p.includes("test") || p.includes("spec"));
      const hasFix = paths.some((p) => p.includes("fix") || allChanges.some((c) => c.status === "deleted"));
      const hasConfig = paths.some((p) => p.includes("config") || p.includes(".json") || p.includes(".toml") || p.includes(".yml"));
      const prefix = hasTests ? "test:" : hasFix ? "fix:" : hasConfig ? "chore:" : "feat:";

      if (allChanges.length === 1) {
        const fileName = allChanges[0].path.split("/").pop() ?? allChanges[0].path;
        setCommitMessage(`${prefix} update ${fileName}`);
      } else {
        const first = allChanges[0].path.split("/").pop() ?? allChanges[0].path;
        const second = allChanges.length > 1 ? allChanges[1].path.split("/").pop() ?? allChanges[1].path : "";
        const msg = allChanges.length === 2
          ? `${prefix} update ${first}, ${second}`
          : `${prefix} update ${allChanges.length} files: ${first}, ${second}...`;
        setCommitMessage(msg);
      }
    } catch {
      setCommitMessage(`Changes ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
    } finally {
      setAiGenerating(false);
    }
  }, [activeWorkspace, activeSessions, workspaceGitStatus]);

  if (!sidebarOpen) return null;

  const totalChanges = (workspaceGitStatus?.staged.length ?? 0)
    + (workspaceGitStatus?.unstaged.length ?? 0)
    + (workspaceGitStatus?.untracked.length ?? 0);

  const fileTreeDir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir ?? null;

  const gitChangesMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!workspaceGitStatus) return map;
    for (const f of workspaceGitStatus.staged) {
      const name = f.path.split("/").pop() ?? f.path;
      map.set(name, f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M");
    }
    for (const f of workspaceGitStatus.unstaged) {
      const name = f.path.split("/").pop() ?? f.path;
      if (!map.has(name)) {
        map.set(name, f.status === "deleted" ? "D" : "M");
      }
    }
    for (const u of workspaceGitStatus.untracked) {
      const name = u.split("/").pop() ?? u;
      map.set(name, "?");
    }
    return map;
  }, [workspaceGitStatus]);

  return (
    <div
      style={{
        width: "240px",
        height: "100%",
        background: "#141414",
        borderRight: "1px solid #2a2a2a",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'SF Mono', 'Menlo', monospace",
        fontSize: "11px",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Workspace name + git branch compact header */}
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid #2a2a2a",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: "#ff8c00", fontWeight: "bold", fontSize: "11px", letterSpacing: "0.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeWorkspace?.name ?? "No workspace"}
          </span>
          {workspaceGitStatus && (
            <>
              <span style={{ color: "#2a2a2a" }}>|</span>
              <span style={{ color: "#d500f9", fontSize: "10px", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {workspaceGitStatus.branch}
              </span>
              {workspaceGitStatus.ahead > 0 && <span style={{ color: "#00c853", fontSize: "9px" }}>+{workspaceGitStatus.ahead}</span>}
              {workspaceGitStatus.behind > 0 && <span style={{ color: "#ff3d00", fontSize: "9px" }}>-{workspaceGitStatus.behind}</span>}
            </>
          )}
        </div>
        {/* Remote connection indicator */}
        {workspaceGitStatus && (
          <div style={{ display: "flex", alignItems: "center" }}>
            {workspaceGitStatus.has_remote ? (
              <span
                title={`Connected to ${workspaceGitStatus.remote_url}`}
                style={{
                  fontSize: "9px", fontWeight: "bold", color: "#00c853",
                  letterSpacing: "0.5px",
                }}
              >
                &#x21D4; GITHUB
              </span>
            ) : (
              <span
                title="Not connected to GitHub. Run: git remote add origin <url>"
                style={{
                  fontSize: "9px", fontWeight: "bold", color: "#ff8c00",
                  letterSpacing: "0.5px",
                }}
              >
                LOCAL ONLY
              </span>
            )}
          </div>
        )}
        {/* Push / Pull / Git buttons */}
        {workspaceGitStatus && (
          <div style={{ display: "flex", gap: "2px" }}>
            <button
              onClick={() => {
                if (!workspaceGitStatus.has_remote) {
                  addToast("No remote configured. This project isn't connected to GitHub yet.\n\n1. Create a repo on GitHub\n2. Run: git remote add origin https://github.com/your-name/your-repo.git", "warning", 8000);
                  return;
                }
                handleQuickPull();
              }}
              disabled={pullLoading}
              title={workspaceGitStatus.has_remote
                ? `Pull from ${workspaceGitStatus.remote_url.replace(/\.git$/, "").replace(/^https?:\/\//, "")}`
                : "No remote configured — add one first"}
              style={{
                flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a",
                color: pullLoading ? "#333333" : !workspaceGitStatus.has_remote ? "#444444" : "#4a9eff",
                fontSize: "9px", fontFamily: "'SF Mono', monospace",
                cursor: pullLoading ? "default" : "pointer", padding: "3px",
              }}
              onMouseEnter={(e) => { if (!pullLoading) e.currentTarget.style.borderColor = workspaceGitStatus.has_remote ? "#4a9eff" : "#444444"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >{pullLoading ? "..." : workspaceGitStatus.has_remote ? "PULL \u2193" : "PULL"}</button>
            <button
              onClick={() => {
                if (!workspaceGitStatus.has_remote) {
                  addToast("This project isn't connected to GitHub yet.\n\n1. Create a repo on GitHub\n2. Run: git remote add origin https://github.com/your-name/your-repo.git", "warning", 8000);
                  return;
                }
                handleQuickPush();
              }}
              disabled={pushLoading}
              title={workspaceGitStatus.has_remote
                ? `Push to ${workspaceGitStatus.remote_url.replace(/\.git$/, "").replace(/^https?:\/\//, "")}`
                : "No remote configured — add one first"}
              style={{
                flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a",
                color: pushLoading ? "#333333" : !workspaceGitStatus.has_remote ? "#444444" : "#00c853",
                fontSize: "9px", fontFamily: "'SF Mono', monospace",
                cursor: pushLoading ? "default" : "pointer", padding: "3px",
              }}
              onMouseEnter={(e) => { if (!pushLoading) e.currentTarget.style.borderColor = workspaceGitStatus.has_remote ? "#00c853" : "#444444"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >
              {pushLoading ? "..." : workspaceGitStatus.has_remote
                ? `PUSH \u2191${workspaceGitStatus.ahead > 0 ? ` (${workspaceGitStatus.ahead})` : ""}`
                : "PUSH"}
            </button>
            <button onClick={() => {
              const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
              setGitManagerOpen(true, dir);
            }} style={{
              flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#ff8c00",
              fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: "pointer", padding: "3px",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >GIT</button>
          </div>
        )}
      </div>

      {/* CHANGES section - always visible */}
      <div style={{ borderBottom: "1px solid #2a2a2a" }}>
        <div
          onClick={() => setChangesOpen(!changesOpen)}
          style={{
            padding: "8px 12px",
            color: "#ff8c00",
            fontWeight: "bold",
            fontSize: "10px",
            letterSpacing: "1px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            userSelect: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ fontSize: "8px" }}>{changesOpen ? "\u25BC" : "\u25B6"}</span>
          CHANGES
          {totalChanges > 0 && (
            <span style={{
              color: "#0a0a0a", background: "#ffab00", fontSize: "9px", fontWeight: "bold",
              padding: "0 4px", lineHeight: "14px", minWidth: "14px", textAlign: "center",
            }}>
              {totalChanges}
            </span>
          )}
          {totalChanges > 0 && workspaceGitStatus && (
            <span style={{ color: "#555555", fontSize: "9px", fontWeight: "normal", flex: 1, textAlign: "right" }}>
              {workspaceGitStatus.staged.length > 0 && `${workspaceGitStatus.staged.length}S`}
              {workspaceGitStatus.staged.length > 0 && workspaceGitStatus.unstaged.length > 0 ? " " : ""}
              {workspaceGitStatus.unstaged.length > 0 && `${workspaceGitStatus.unstaged.length}M`}
              {(workspaceGitStatus.staged.length > 0 || workspaceGitStatus.unstaged.length > 0) && workspaceGitStatus.untracked.length > 0 ? " " : ""}
              {workspaceGitStatus.untracked.length > 0 && `${workspaceGitStatus.untracked.length}?`}
            </span>
          )}
        </div>
        {changesOpen && workspaceGitStatus && totalChanges > 0 && (
          <div style={{ maxHeight: "220px", overflow: "auto" }}>
            {/* Staged files */}
            {workspaceGitStatus.staged.map((f) => {
              const fileName = f.path.split("/").pop() ?? f.path;
              const badge = f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M";
              return (
                <div
                  key={`staged-${f.path}`}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "3px 12px", fontSize: "10px", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  onClick={() => {
                    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
                    setGitManagerOpen(true, dir);
                  }}
                >
                  <span style={{
                    color: "#00c853", fontWeight: "bold", fontSize: "9px",
                    width: "14px", textAlign: "center", flexShrink: 0,
                  }}>{badge}</span>
                  <span style={{ color: "#e0e0e0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fileName}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStageToggle(f.path, true); }}
                    title="Unstage file"
                    style={{
                      background: "#00c85322", border: "1px solid #00c85366", color: "#00c853",
                      fontSize: "8px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
                      padding: "0px 3px", lineHeight: "14px", fontWeight: "bold",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#00c853"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#00c85366"; }}
                  >S</button>
                </div>
              );
            })}
            {/* Unstaged (modified) files */}
            {workspaceGitStatus.unstaged.map((f) => {
              const fileName = f.path.split("/").pop() ?? f.path;
              const badge = f.status === "deleted" ? "D" : "M";
              const badgeColor = f.status === "deleted" ? "#ff3d00" : "#ffab00";
              return (
                <div
                  key={`unstaged-${f.path}`}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "3px 12px", fontSize: "10px", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  onClick={() => {
                    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
                    setGitManagerOpen(true, dir);
                  }}
                >
                  <span style={{
                    color: badgeColor, fontWeight: "bold", fontSize: "9px",
                    width: "14px", textAlign: "center", flexShrink: 0,
                  }}>{badge}</span>
                  <span style={{ color: "#e0e0e0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fileName}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStageToggle(f.path, false); }}
                    title="Stage file"
                    style={{
                      background: "transparent", border: "1px solid #333333", color: "#555555",
                      fontSize: "8px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
                      padding: "0px 3px", lineHeight: "14px", fontWeight: "bold",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#888888"; e.currentTarget.style.color = "#888888"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#333333"; e.currentTarget.style.color = "#555555"; }}
                  >S</button>
                </div>
              );
            })}
            {/* Untracked files */}
            {workspaceGitStatus.untracked.map((filePath) => {
              const fileName = filePath.split("/").pop() ?? filePath;
              return (
                <div
                  key={`untracked-${filePath}`}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "3px 12px", fontSize: "10px", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  onClick={() => {
                    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
                    setGitManagerOpen(true, dir);
                  }}
                >
                  <span style={{
                    color: "#555555", fontWeight: "bold", fontSize: "9px",
                    width: "14px", textAlign: "center", flexShrink: 0,
                  }}>?</span>
                  <span style={{ color: "#888888", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fileName}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStageToggle(filePath, false); }}
                    title="Stage file"
                    style={{
                      background: "transparent", border: "1px solid #333333", color: "#555555",
                      fontSize: "8px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
                      padding: "0px 3px", lineHeight: "14px", fontWeight: "bold",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#888888"; e.currentTarget.style.color = "#888888"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#333333"; e.currentTarget.style.color = "#555555"; }}
                  >S</button>
                </div>
              );
            })}
            {/* Commit / Push row */}
            <div style={{ padding: "6px 12px", display: "flex", gap: "2px", flexDirection: "column" }}>
              {commitFormOpen ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", gap: "2px" }}>
                    <input
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Commit message..."
                      style={{
                        background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0",
                        fontSize: "10px", fontFamily: "'SF Mono', monospace", padding: "5px 6px",
                        outline: "none", flex: 1, boxSizing: "border-box", minWidth: 0,
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCommit(); if (e.key === "Escape") setCommitFormOpen(false); }}
                      autoFocus
                    />
                    <button
                      onClick={handleGenerateCommitMessage}
                      disabled={aiGenerating}
                      title="Generate commit message from changes"
                      style={{
                        background: "#1e1e1e", border: "1px solid #2a2a2a",
                        color: aiGenerating ? "#555555" : "#d500f9",
                        fontSize: "10px", fontFamily: "'SF Mono', monospace",
                        cursor: aiGenerating ? "wait" : "pointer",
                        padding: "3px 5px", flexShrink: 0,
                      }}
                      onMouseEnter={(e) => { if (!aiGenerating) e.currentTarget.style.borderColor = "#d500f9"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                    >{aiGenerating ? "..." : "\u2726"}</button>
                  </div>
                  <div style={{ display: "flex", gap: "2px" }}>
                    <button
                      onClick={handleCommit}
                      disabled={!commitMessage.trim()}
                      style={{
                        flex: 1, background: commitMessage.trim() ? "#ff8c00" : "#1e1e1e",
                        border: "1px solid #2a2a2a",
                        color: commitMessage.trim() ? "#0a0a0a" : "#555555",
                        fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: commitMessage.trim() ? "pointer" : "default",
                        padding: "3px", fontWeight: "bold",
                      }}
                    >COMMIT</button>
                    <button
                      onClick={() => setCommitFormOpen(false)}
                      style={{
                        background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888888",
                        fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
                        padding: "3px 6px",
                      }}
                    >ESC</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "2px" }}>
                  <button
                    onClick={() => setCommitFormOpen(true)}
                    disabled={workspaceGitStatus.staged.length === 0}
                    style={{
                      flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a",
                      color: workspaceGitStatus.staged.length > 0 ? "#ff8c00" : "#333333",
                      fontSize: "9px", fontFamily: "'SF Mono', monospace",
                      cursor: workspaceGitStatus.staged.length > 0 ? "pointer" : "default",
                      padding: "3px", fontWeight: "bold",
                    }}
                    onMouseEnter={(e) => { if (workspaceGitStatus.staged.length > 0) { e.currentTarget.style.borderColor = "#ff8c00"; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                  >COMMIT</button>
                  <button
                    onClick={() => {
                      if (!workspaceGitStatus.has_remote) {
                        addToast("This project isn't connected to GitHub yet.\n\n1. Create a repo on GitHub\n2. Run: git remote add origin https://github.com/your-name/your-repo.git", "warning", 8000);
                        return;
                      }
                      handleQuickPush();
                    }}
                    disabled={pushLoading}
                    title={workspaceGitStatus.has_remote
                      ? `Push to ${workspaceGitStatus.remote_url.replace(/\.git$/, "").replace(/^https?:\/\//, "")}`
                      : "No remote configured — add one first"}
                    style={{
                      flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a",
                      color: pushLoading ? "#333333" : !workspaceGitStatus.has_remote ? "#444444" : "#00c853",
                      fontSize: "9px", fontFamily: "'SF Mono', monospace",
                      cursor: pushLoading ? "default" : "pointer",
                      padding: "3px", fontWeight: "bold",
                    }}
                    onMouseEnter={(e) => { if (!pushLoading) e.currentTarget.style.borderColor = workspaceGitStatus.has_remote ? "#00c853" : "#444444"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                  >{workspaceGitStatus.has_remote ? "PUSH \u2191" : "PUSH"}</button>
                </div>
              )}
            </div>
          </div>
        )}
        {changesOpen && totalChanges === 0 && (
          <div style={{ padding: "6px 12px 8px", color: "#333333", fontSize: "10px" }}>
            No changes
          </div>
        )}
      </div>

      {/* FILES section */}
      {fileTreeDir && (
        <div style={{ display: "flex", flexDirection: "column", flex: filesOpen ? 1 : undefined, minHeight: 0 }}>
          <div
            onClick={() => setFilesOpen(!filesOpen)}
            style={{
              padding: "8px 12px",
              color: "#ff8c00",
              fontWeight: "bold",
              fontSize: "10px",
              letterSpacing: "1px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              userSelect: "none",
              borderBottom: filesOpen ? "1px solid #2a2a2a" : "none",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ fontSize: "8px" }}>{filesOpen ? "\u25BC" : "\u25B6"}</span>
            FILES
          </div>
          {filesOpen && (
            <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              <FileTree rootPath={fileTreeDir} gitChanges={gitChangesMap} />
            </div>
          )}
        </div>
      )}

      {/* Tool buttons at bottom */}
      <div style={{ marginTop: "auto", flexShrink: 0 }}>
        <div style={{ borderTop: "1px solid #2a2a2a", padding: "6px 6px", display: "flex", gap: "2px", flexWrap: "wrap" }}>
          {[
            { label: "HUB", onClick: () => setHubBrowserOpen(true), hoverColor: "#00c853" },
            { label: "SKILLS", onClick: () => setSkillsPanelOpen(true), hoverColor: "#4a9eff" },
            { label: "MCP", onClick: () => {
              const focused = sessions.find((s) => s.id === focusedSessionId);
              setMcpManagerOpen(true, focused?.working_dir ?? activeWorkspace?.repo_path ?? undefined);
            }, hoverColor: "#d500f9" },
          ].map((btn) => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              style={{
                flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888888",
                fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
                padding: "5px 4px", textAlign: "center", minWidth: "36px", whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = btn.hoverColor; e.currentTarget.style.borderColor = btn.hoverColor; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#888888"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "0 6px 6px 6px", display: "flex", gap: "2px" }}>
          {[
            { label: "CLAUDE.md", onClick: () => {
              const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
              if (dir) setClaudeMdEditorOpen(true, dir);
              else addToast("No project directory -- open a session first", "warning");
            }, hoverColor: "#ffab00" },
            { label: "GIT SETUP", onClick: () => setGitSetupWizardOpen(true), hoverColor: "#ff8c00" },
          ].map((btn) => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              style={{
                flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888888",
                fontSize: "9px", fontFamily: "'SF Mono', monospace", cursor: "pointer",
                padding: "5px 4px", textAlign: "center", minWidth: "36px", whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = btn.hoverColor; e.currentTarget.style.borderColor = btn.hoverColor; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#888888"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
