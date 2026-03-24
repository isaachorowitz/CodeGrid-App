import { memo, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useWorkspaceStore, type ActivityPanel } from "../stores/workspaceStore";
import { useSessionStore } from "../stores/sessionStore";
import { useAppStore } from "../stores/appStore";
import { useToastStore } from "../stores/toastStore";
import {
  gitStatus, gitPush, gitPull, gitStageFile, gitUnstageFile, gitCommit,
  gitDiffStat, quickPublish, quickSave,
  gitListBranches, gitLog, gitCreateBranch, gitSwitchBranch, gitShowCommit,
  gitFetch, gitStash, gitStageAll, gitDiscardFile,
  type GitStatusInfo, type GitBranchInfo, type GitLogEntry,
} from "../lib/ipc";
import { FileTree } from "./FileTree";
import { ProjectSearch } from "./ProjectSearch";

// ---------------------------------------------------------------------------
// Activity Bar (far-left icon rail)
// ---------------------------------------------------------------------------

const ACTIVITY_ITEMS: { id: ActivityPanel; label: string; icon: string }[] = [
  { id: "files",    label: "Files",    icon: "\u2630" },
  { id: "search",   label: "Search",   icon: "\u2315" },
  { id: "git",      label: "Git",      icon: "\u2387" },
  { id: "settings", label: "Settings", icon: "\u2699" },
];

const ActivityBar = memo(function ActivityBar({
  activePanel,
  onToggle,
  gitBadge,
}: {
  activePanel: ActivityPanel;
  onToggle: (panel: ActivityPanel) => void;
  gitBadge: number;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
      style={{
        width: "40px",
        height: "100%",
        background: "rgba(13, 13, 13, 0.92)",
        border: "1px solid #2a2a2a",
        borderRadius: "12px",
        boxShadow: "0 10px 24px rgba(0, 0, 0, 0.35)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "4px",
        flexShrink: 0,
        fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {ACTIVITY_ITEMS.map((item) => {
        const isActive = activePanel === item.id;
        const isHovered = hoveredId === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
            title={item.label}
            style={{
              width: "36px",
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              borderLeft: isActive ? "2px solid #ff8c00" : "2px solid transparent",
              color: isActive ? "#ff8c00" : isHovered ? "#e0e0e0" : "#555555",
              fontSize: "18px",
              cursor: "pointer",
              padding: 0,
              position: "relative",
              transition: "color 0.15s ease",
            }}
          >
            {item.icon}
            {item.id === "git" && gitBadge > 0 && (
              <span style={{
                position: "absolute",
                top: "4px",
                right: "4px",
                background: "#ffab00",
                color: "#0a0a0a",
                fontSize: "7px",
                fontWeight: "bold",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                minWidth: "12px",
                height: "12px",
                lineHeight: "12px",
                textAlign: "center",
                borderRadius: "2px",
                padding: "0 2px",
              }}>
                {gitBadge > 99 ? "99" : gitBadge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});


// ---------------------------------------------------------------------------
// Panel: Files
// ---------------------------------------------------------------------------
const FilesPanel = memo(function FilesPanel({
  fileTreeDir,
  gitChangesMap,
}: {
  fileTreeDir: string | null;
  gitChangesMap: Map<string, string>;
}) {
  if (!fileTreeDir) {
    return (
      <div style={{ padding: "16px 12px", color: "#555555", fontSize: "10px" }}>
        Open a session to browse files.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <FileTree rootPath={fileTreeDir} gitChanges={gitChangesMap} />
      </div>
    </div>
  );
});


// ---------------------------------------------------------------------------
// Panel: Git (inline, not the overlay GitManager)
// ---------------------------------------------------------------------------
const GitPanel = memo(function GitPanel({
  workspaceGitStatus,
  activeWorkspace,
  activeSessions,
  onRefreshGit,
}: {
  workspaceGitStatus: GitStatusInfo | null;
  activeWorkspace: { repo_path: string | null; name: string } | undefined;
  activeSessions: { working_dir: string }[];
  onRefreshGit: () => void;
}) {
  const { setGitSetupWizardOpen, setCodeViewerOpen } = useAppStore();
  const addToast = useToastStore((s) => s.addToast);
  const [pushLoading, setPushLoading] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [commitFormOpen, setCommitFormOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [discardLoading, setDiscardLoading] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [logEntries, setLogEntries] = useState<GitLogEntry[]>([]);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [branchSwitching, setBranchSwitching] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [selectedCommitDetail, setSelectedCommitDetail] = useState<string | null>(null);
  const branchDropdownRef = useRef<HTMLDivElement>(null);

  const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir ?? null;

  const resolvePath = useCallback((relativePath: string) => {
    if (!dir) return relativePath;
    return relativePath.startsWith("/") ? relativePath : `${dir.replace(/\/$/, "")}/${relativePath}`;
  }, [dir]);

  const openDiffReview = useCallback((relativePath: string) => {
    if (!dir) return;
    setCodeViewerOpen(true, resolvePath(relativePath), { diffMode: true, workingDir: dir });
  }, [dir, resolvePath, setCodeViewerOpen]);

  const refreshBranchesAndLog = useCallback(async () => {
    if (!dir) return;
    gitListBranches(dir).then(setBranches).catch(() => {});
    gitLog(dir, 20).then(setLogEntries).catch(() => {});
  }, [dir]);

  useEffect(() => { refreshBranchesAndLog(); }, [refreshBranchesAndLog]);

  // Close branch dropdown on outside click
  useEffect(() => {
    if (!branchDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [branchDropdownOpen]);

  const handleSwitchBranch = useCallback(async (name: string) => {
    if (!dir) return;
    setBranchSwitching(true);
    setBranchDropdownOpen(false);
    try {
      await gitSwitchBranch(dir, name.replace(/^origin\//, ""));
      addToast(`Switched to ${name}`, "success", 3000);
      onRefreshGit();
      refreshBranchesAndLog();
    } catch (e) { addToast(`Switch failed: ${e}`, "error", 5000); }
    setBranchSwitching(false);
  }, [dir, addToast, onRefreshGit, refreshBranchesAndLog]);

  const handleCreateBranch = useCallback(async () => {
    if (!dir || !newBranchName.trim()) return;
    setBranchSwitching(true);
    try {
      await gitCreateBranch(dir, newBranchName.trim(), true);
      addToast(`Created & switched to ${newBranchName.trim()}`, "success", 3000);
      setNewBranchName("");
      setBranchDropdownOpen(false);
      onRefreshGit();
      refreshBranchesAndLog();
    } catch (e) { addToast(`Create branch failed: ${e}`, "error", 5000); }
    setBranchSwitching(false);
  }, [dir, newBranchName, addToast, onRefreshGit, refreshBranchesAndLog]);

  const handleQuickPush = useCallback(async () => {
    if (!dir || pushLoading) return;
    if (!workspaceGitStatus?.has_remote) {
      addToast("No remote. Add: git remote add origin <url>", "warning", 5000);
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
      onRefreshGit();
      refreshBranchesAndLog();
    } catch (e) {
      const msg = String(e).replace(/^Error:\s*/, "");
      const needsPull = /rejected|fetch first|cannot fast-forward|non-fast-forward/i.test(msg);
      if (needsPull) {
        addToast(
          "Push rejected — remote has changes you don't have locally. Pull first, then push.",
          "warning", 10000
        );
      } else {
        addToast(`Push failed: ${msg}`, "error", 6000);
      }
    } finally {
      setPushLoading(false);
    }
  }, [dir, workspaceGitStatus, addToast, pushLoading, onRefreshGit, refreshBranchesAndLog]);

  const handleQuickPull = useCallback(async () => {
    if (!dir || pullLoading) return;
    setPullLoading(true);
    try {
      const result = await gitPull(dir);
      const detail = result?.includes("Already up to date")
        ? "Already up to date"
        : result || "Pulled latest changes";
      addToast(detail, "success", 4000);
      onRefreshGit();
    } catch (e) {
      addToast(`Pull failed: ${String(e).replace(/^Error:\s*/, "")}`, "error", 6000);
    } finally {
      setPullLoading(false);
    }
  }, [dir, addToast, pullLoading, onRefreshGit]);

  const handleStageToggle = useCallback(async (filePath: string, isStaged: boolean) => {
    if (!dir) return;
    try {
      if (isStaged) {
        await gitUnstageFile(dir, filePath);
      } else {
        await gitStageFile(dir, filePath);
      }
      onRefreshGit();
    } catch (e) { addToast(`Stage/unstage failed: ${e}`, "error"); }
  }, [dir, onRefreshGit, addToast]);

  const handleCommit = useCallback(async () => {
    if (!dir || !commitMessage.trim()) return;
    try {
      await gitCommit(dir, commitMessage.trim());
      addToast("Committed successfully", "success");
      setCommitMessage("");
      setCommitFormOpen(false);
      onRefreshGit();
    } catch (e) { addToast(`Commit failed: ${e}`, "error"); }
  }, [dir, commitMessage, onRefreshGit, addToast]);

  const handleGenerateCommitMessage = useCallback(async () => {
    if (!dir || !workspaceGitStatus) return;
    setAiGenerating(true);
    try {
      await gitDiffStat(dir);
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
  }, [dir, workspaceGitStatus]);

  const handlePublish = useCallback(async () => {
    if (!dir || publishLoading) return;
    if (!workspaceGitStatus?.has_remote) {
      setGitSetupWizardOpen(true);
      return;
    }
    setPublishLoading(true);
    try {
      const result = await quickPublish(dir);
      if (result.files_changed === 0) {
        addToast("No changes to commit and push.", "info", 3000);
      } else {
        addToast(
          `Committed & pushed ${result.files_changed} file${result.files_changed === 1 ? "" : "s"} (${result.commit_hash})`,
          "success", 4000
        );
      }
      onRefreshGit();
      refreshBranchesAndLog();
    } catch (e) {
      const msg = String(e).replace(/^Error:\s*/, "");
      const needsPull = /rejected|fetch first|cannot fast-forward|non-fast-forward/i.test(msg);
      if (needsPull) {
        addToast("Push rejected — remote has changes you don't have locally. Pull first, then push.", "warning", 10000);
      } else {
        addToast(`Commit & push failed: ${msg}`, "error", 6000);
      }
    } finally {
      setPublishLoading(false);
    }
  }, [dir, publishLoading, workspaceGitStatus, addToast, onRefreshGit, setGitSetupWizardOpen]);

  const handleSave = useCallback(async () => {
    if (!dir || saveLoading) return;
    setSaveLoading(true);
    try {
      const result = await quickSave(dir);
      if (result.files_changed === 0) {
        addToast("No changes to commit.", "info", 3000);
      } else {
        addToast(
          `Committed ${result.files_changed} file${result.files_changed === 1 ? "" : "s"} (${result.commit_hash})`,
          "success", 4000
        );
      }
      onRefreshGit();
    } catch (e) {
      addToast(`Commit failed: ${String(e).replace(/^Error:\s*/, "")}`, "error", 6000);
    } finally {
      setSaveLoading(false);
    }
  }, [dir, saveLoading, addToast, onRefreshGit]);

  const totalChanges = (workspaceGitStatus?.staged.length ?? 0)
    + (workspaceGitStatus?.unstaged.length ?? 0)
    + (workspaceGitStatus?.untracked.length ?? 0);

  if (!workspaceGitStatus) {
    return (
      <div style={{ padding: "16px 12px", color: "#555555", fontSize: "10px" }}>
        No git repository detected.
      </div>
    );
  }

  const noChanges = totalChanges === 0;
  const hasRemote = workspaceGitStatus.has_remote;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto" }}>
      {/* Quick Publish / Save buttons */}
      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: "4px", borderBottom: "1px solid #2a2a2a" }}>
        {!hasRemote ? (
          <button
            onClick={() => setGitSetupWizardOpen(true)}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#ff8c00",
              border: "none",
              color: "#0a0a0a",
              fontSize: "11px",
              fontWeight: "bold",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              cursor: "pointer",
              letterSpacing: "0.5px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#ffa333"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#ff8c00"; }}
          >
            {"\u2191 CONNECT REMOTE"}
          </button>
        ) : noChanges ? (
          <button
            disabled
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#1e1e1e",
              border: "1px solid #333333",
              color: "#555555",
              fontSize: "11px",
              fontWeight: "bold",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              cursor: "default",
              letterSpacing: "0.5px",
            }}
          >
            {"\u2713 NO CHANGES"}
          </button>
        ) : (
          <button
            onClick={handlePublish}
            disabled={publishLoading}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: publishLoading ? "#cc7000" : "#ff8c00",
              border: "none",
              color: "#0a0a0a",
              fontSize: "11px",
              fontWeight: "bold",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              cursor: publishLoading ? "wait" : "pointer",
              letterSpacing: "0.5px",
            }}
            onMouseEnter={(e) => { if (!publishLoading) e.currentTarget.style.background = "#ffa333"; }}
            onMouseLeave={(e) => { if (!publishLoading) e.currentTarget.style.background = "#ff8c00"; }}
          >
            {publishLoading
              ? "\u2191 PUBLISHING..."
              : `\u2191 COMMIT & PUSH (${totalChanges})`
            }
          </button>
        )}
        {hasRemote && !noChanges && (
          <button
            onClick={handleSave}
            disabled={saveLoading}
            style={{
              width: "100%",
              padding: "5px 12px",
              background: "transparent",
              border: `1px solid ${saveLoading ? "#333333" : "#ff8c0066"}`,
              color: saveLoading ? "#555555" : "#ff8c00",
              fontSize: "9px",
              fontWeight: "bold",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              cursor: saveLoading ? "wait" : "pointer",
              letterSpacing: "0.5px",
            }}
            onMouseEnter={(e) => { if (!saveLoading) { e.currentTarget.style.borderColor = "#ff8c00"; e.currentTarget.style.background = "#ff8c0015"; } }}
            onMouseLeave={(e) => { if (!saveLoading) { e.currentTarget.style.borderColor = "#ff8c0066"; e.currentTarget.style.background = "transparent"; } }}
          >
            {saveLoading
              ? "SAVING..."
              : "COMMIT ONLY"
            }
          </button>
        )}
        {!hasRemote && totalChanges > 0 && (
          <button
            onClick={handleSave}
            disabled={saveLoading}
            style={{
              width: "100%",
              padding: "5px 12px",
              background: "transparent",
              border: `1px solid ${saveLoading ? "#333333" : "#ff8c0066"}`,
              color: saveLoading ? "#555555" : "#ff8c00",
              fontSize: "9px",
              fontWeight: "bold",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              cursor: saveLoading ? "wait" : "pointer",
              letterSpacing: "0.5px",
            }}
            onMouseEnter={(e) => { if (!saveLoading) { e.currentTarget.style.borderColor = "#ff8c00"; e.currentTarget.style.background = "#ff8c0015"; } }}
            onMouseLeave={(e) => { if (!saveLoading) { e.currentTarget.style.borderColor = "#ff8c0066"; e.currentTarget.style.background = "transparent"; } }}
          >
            {saveLoading
              ? "SAVING..."
              : `COMMIT ALL (${totalChanges})`
            }
          </button>
        )}
        {totalChanges > 0 && (
          <button
            onClick={() => {
              const first = workspaceGitStatus.staged[0]?.path
                ?? workspaceGitStatus.unstaged[0]?.path
                ?? workspaceGitStatus.untracked[0];
              if (first) openDiffReview(first);
            }}
            style={{
              width: "100%",
              padding: "5px 12px",
              background: "transparent",
              border: "1px solid #4a9eff66",
              color: "#4a9eff",
              fontSize: "9px",
              fontWeight: "bold",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              cursor: "pointer",
              letterSpacing: "0.5px",
            }}
          >
            REVIEW CHANGES
          </button>
        )}

        {/* Quick git actions row */}
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button
            onClick={async () => {
              if (!dir) return;
              try { await gitFetch(dir); addToast("Fetched", "success"); onRefreshGit(); } catch (e) { addToast(`Fetch failed: ${e}`, "error"); }
            }}
            style={{ flex: 1, padding: "4px 6px", background: "transparent", border: "1px solid #333333", color: "#888888", fontSize: "9px", fontWeight: "bold", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer", letterSpacing: "0.5px" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; e.currentTarget.style.color = "#e0e0e0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#333333"; e.currentTarget.style.color = "#888888"; }}
          >FETCH</button>
          <button
            onClick={async () => {
              if (!dir) return;
              try { await gitStash(dir); addToast("Stashed", "success"); onRefreshGit(); } catch (e) { addToast(`Stash failed: ${e}`, "error"); }
            }}
            style={{ flex: 1, padding: "4px 6px", background: "transparent", border: "1px solid #333333", color: "#888888", fontSize: "9px", fontWeight: "bold", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer", letterSpacing: "0.5px" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; e.currentTarget.style.color = "#e0e0e0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#333333"; e.currentTarget.style.color = "#888888"; }}
          >STASH</button>
          {totalChanges > 0 && (
            <>
              <button
                onClick={async () => {
                  if (!dir) return;
                  try { await gitStageAll(dir); addToast("All staged", "success"); onRefreshGit(); } catch (e) { addToast(`Stage all failed: ${e}`, "error"); }
                }}
                style={{ flex: 1, padding: "4px 6px", background: "transparent", border: "1px solid #00c85366", color: "#00c853", fontSize: "9px", fontWeight: "bold", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer", letterSpacing: "0.5px" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#00c85322"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >STAGE ALL</button>
              <button
                onClick={() => setDiscardConfirmOpen(true)}
                style={{ flex: 1, padding: "4px 6px", background: "transparent", border: "1px solid #ff3d0066", color: "#ff3d00", fontSize: "9px", fontWeight: "bold", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer", letterSpacing: "0.5px" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#ff3d0022"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >DISCARD ALL</button>
            </>
          )}
        </div>
      </div>

      {/* Branch switcher */}
      <div ref={branchDropdownRef} style={{ borderBottom: "1px solid #2a2a2a", position: "relative" }}>
        <button
          onClick={() => { setBranchDropdownOpen((o) => !o); setBranchSearch(""); }}
          style={{
            width: "100%", padding: "7px 12px", background: "transparent", border: "none",
            display: "flex", alignItems: "center", gap: "6px", cursor: branchSwitching ? "default" : "pointer",
            borderBottom: branchDropdownOpen ? "1px solid #ff8c0066" : "none",
          }}
        >
          <span style={{ color: "#d500f9", fontSize: "11px", fontWeight: "bold", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
            {branchSwitching ? "switching..." : (workspaceGitStatus.branch ?? "...")}
          </span>
          {workspaceGitStatus.ahead > 0 && <span style={{ color: "#00c853", fontSize: "9px" }}>+{workspaceGitStatus.ahead}</span>}
          {workspaceGitStatus.behind > 0 && <span style={{ color: "#ff3d00", fontSize: "9px" }}>-{workspaceGitStatus.behind}</span>}
          {workspaceGitStatus.has_remote
            ? <span title={workspaceGitStatus.remote_url ?? "Connected to remote"} style={{ fontSize: "8px", color: "#00c853", background: "#00c85322", padding: "1px 4px", fontWeight: "bold" }}>● CONNECTED</span>
            : <span title="No remote configured" style={{ fontSize: "8px", color: "#ff3d00", background: "#ff3d0022", padding: "1px 4px", fontWeight: "bold" }}>● NO REMOTE</span>}
          <span style={{ fontSize: "8px", color: "#555555" }}>{branchDropdownOpen ? "▲" : "▼"}</span>
        </button>

        {branchDropdownOpen && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
            background: "#141414", border: "1px solid #ff8c0066", borderTop: "none",
            maxHeight: "260px", display: "flex", flexDirection: "column",
          }}>
            {/* Search */}
            <input
              autoFocus
              value={branchSearch}
              onChange={(e) => setBranchSearch(e.target.value)}
              placeholder="Search or create branch..."
              style={{
                background: "#0a0a0a", border: "none", borderBottom: "1px solid #2a2a2a",
                color: "#e0e0e0", fontSize: "10px",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                padding: "6px 10px", outline: "none", flexShrink: 0,
              }}
              onKeyDown={(e) => { if (e.key === "Escape") setBranchDropdownOpen(false); }}
            />
            {/* Branch list */}
            <div style={{ overflow: "auto", flex: 1 }}>
              {branches
                .filter((b) => !branchSearch || b.name.toLowerCase().includes(branchSearch.toLowerCase()))
                .map((b) => (
                  <div
                    key={b.name}
                    onClick={() => !b.is_current && handleSwitchBranch(b.name)}
                    style={{
                      padding: "5px 10px", cursor: b.is_current ? "default" : "pointer",
                      display: "flex", alignItems: "center", gap: "6px",
                      background: b.is_current ? "#1e1e1e" : "transparent",
                      borderLeft: b.is_current ? "2px solid #ff8c00" : "2px solid transparent",
                    }}
                    onMouseEnter={(e) => { if (!b.is_current) e.currentTarget.style.background = "#1a1a1a"; }}
                    onMouseLeave={(e) => { if (!b.is_current) e.currentTarget.style.background = b.is_current ? "#1e1e1e" : "transparent"; }}
                  >
                    <span style={{ color: b.is_remote ? "#4a9eff" : b.is_current ? "#ff8c00" : "#e0e0e0", fontSize: "10px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.name}
                    </span>
                    {b.is_current && <span style={{ color: "#00c853", fontSize: "8px" }}>✓</span>}
                    {b.is_remote && <span style={{ color: "#4a9eff44", fontSize: "8px" }}>remote</span>}
                  </div>
                ))
              }
              {branches.filter((b) => !branchSearch || b.name.toLowerCase().includes(branchSearch.toLowerCase())).length === 0 && (
                <div style={{ padding: "5px 10px", color: "#555555", fontSize: "10px" }}>No matches</div>
              )}
            </div>
            {/* Create new branch */}
            <div style={{ borderTop: "1px solid #2a2a2a", padding: "5px 8px", display: "flex", gap: "4px", flexShrink: 0 }}>
              <input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="New branch name..."
                style={{
                  flex: 1, background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0",
                  fontSize: "10px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                  padding: "4px 6px", outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateBranch(); }}
              />
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || branchSwitching}
                style={{
                  background: newBranchName.trim() ? "#ff8c00" : "#2a2a2a", border: "none",
                  color: newBranchName.trim() ? "#0a0a0a" : "#555555", fontSize: "9px",
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                  cursor: newBranchName.trim() ? "pointer" : "default", padding: "4px 8px", fontWeight: "bold",
                }}
              >+ CREATE</button>
            </div>
          </div>
        )}

        {/* Push / Pull buttons */}
        <div style={{ display: "flex", gap: "2px", padding: "5px 12px 7px" }}>
          <button
            onClick={() => {
              if (!workspaceGitStatus.has_remote) { addToast("No remote configured.", "warning", 5000); return; }
              handleQuickPull();
            }}
            disabled={pullLoading}
            style={{
              flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a",
              color: pullLoading ? "#333333" : !workspaceGitStatus.has_remote ? "#444444" : "#4a9eff",
              fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              cursor: pullLoading ? "default" : "pointer", padding: "3px",
            }}
            onMouseEnter={(e) => { if (!pullLoading) e.currentTarget.style.borderColor = workspaceGitStatus.has_remote ? "#4a9eff" : "#444444"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
          >{pullLoading ? "..." : `PULL ↓`}</button>
          <button
            onClick={() => {
              if (!workspaceGitStatus.has_remote) { addToast("No remote configured.", "warning", 5000); return; }
              handleQuickPush();
            }}
            disabled={pushLoading}
            style={{
              flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a",
              color: pushLoading ? "#333333" : !workspaceGitStatus.has_remote ? "#444444" : "#00c853",
              fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              cursor: pushLoading ? "default" : "pointer", padding: "3px",
            }}
            onMouseEnter={(e) => { if (!pushLoading) e.currentTarget.style.borderColor = workspaceGitStatus.has_remote ? "#00c853" : "#444444"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
          >{pushLoading ? "..." : `PUSH ↑${workspaceGitStatus.ahead > 0 ? ` (${workspaceGitStatus.ahead})` : ""}`}</button>
        </div>
      </div>

      {/* Changes list */}
      <div style={{ padding: "6px 12px 4px", color: "#ff8c00", fontWeight: "bold", fontSize: "10px", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "6px" }}>
        CHANGES
        {totalChanges > 0 && (
          <span style={{
            color: "#0a0a0a", background: "#ffab00", fontSize: "9px", fontWeight: "bold",
            padding: "0 4px", lineHeight: "14px", minWidth: "14px", textAlign: "center",
          }}>
            {totalChanges}
          </span>
        )}
      </div>

      {totalChanges > 0 && (
        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {/* Staged files */}
          {workspaceGitStatus.staged.map((f) => {
            const fileName = f.path.split("/").pop() ?? f.path;
            const badge = f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M";
            return (
              <div
                key={`staged-${f.path}`}
                onClick={() => openDiffReview(f.path)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "3px 12px", fontSize: "10px", cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  color: "#00c853", fontWeight: "bold", fontSize: "9px",
                  width: "14px", textAlign: "center", flexShrink: 0,
                }}>{badge}</span>
                <span style={{ color: "#e0e0e0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {fileName}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleStageToggle(f.path, true); }}
                  title="Unstage file"
                  style={{
                    background: "#00c85322", border: "1px solid #00c85366", color: "#00c853",
                    fontSize: "8px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
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
                onClick={() => openDiffReview(f.path)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "3px 12px", fontSize: "10px", cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  color: badgeColor, fontWeight: "bold", fontSize: "9px",
                  width: "14px", textAlign: "center", flexShrink: 0,
                }}>{badge}</span>
                <span style={{ color: "#e0e0e0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {fileName}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleStageToggle(f.path, false); }}
                  title="Stage file"
                  style={{
                    background: "transparent", border: "1px solid #333333", color: "#555555",
                    fontSize: "8px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
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
                onClick={() => openDiffReview(filePath)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "3px 12px", fontSize: "10px", cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  color: "#555555", fontWeight: "bold", fontSize: "9px",
                  width: "14px", textAlign: "center", flexShrink: 0,
                }}>?</span>
                <span style={{ color: "#888888", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {fileName}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleStageToggle(filePath, false); }}
                  title="Stage file"
                  style={{
                    background: "transparent", border: "1px solid #333333", color: "#555555",
                    fontSize: "8px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
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
                      fontSize: "10px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", padding: "5px 6px",
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
                      fontSize: "10px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
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
                      fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: commitMessage.trim() ? "pointer" : "default",
                      padding: "3px", fontWeight: "bold",
                    }}
                  >COMMIT</button>
                  <button
                    onClick={() => setCommitFormOpen(false)}
                    style={{
                      background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888888",
                      fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace", cursor: "pointer",
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
                    fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                    cursor: workspaceGitStatus.staged.length > 0 ? "pointer" : "default",
                    padding: "3px", fontWeight: "bold",
                  }}
                  onMouseEnter={(e) => { if (workspaceGitStatus.staged.length > 0) e.currentTarget.style.borderColor = "#ff8c00"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                >COMMIT</button>
                <button
                  onClick={() => {
                    if (!workspaceGitStatus.has_remote) {
                      addToast("No remote configured.", "warning", 5000);
                      return;
                    }
                    handleQuickPush();
                  }}
                  disabled={pushLoading}
                  style={{
                    flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a",
                    color: pushLoading ? "#333333" : !workspaceGitStatus.has_remote ? "#444444" : "#00c853",
                    fontSize: "9px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
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
      {totalChanges === 0 && (
        <div style={{ padding: "6px 12px 8px", color: "#333333", fontSize: "10px" }}>
          No changes
        </div>
      )}

      {/* Git History */}
      <div style={{ borderTop: "1px solid #2a2a2a", flexShrink: 0 }}>
        <button
          onClick={() => setHistoryExpanded((e) => !e)}
          style={{
            width: "100%", background: "none", border: "none", padding: "6px 12px",
            display: "flex", alignItems: "center", gap: "6px", cursor: "pointer",
          }}
        >
          <span style={{ color: "#ff8c00", fontWeight: "bold", fontSize: "10px", letterSpacing: "1px", flex: 1, textAlign: "left" }}>
            HISTORY
          </span>
          {logEntries.length > 0 && (
            <span style={{ color: "#444444", fontSize: "9px" }}>{logEntries.length}</span>
          )}
          <span style={{ color: "#555555", fontSize: "8px" }}>{historyExpanded ? "▲" : "▼"}</span>
        </button>
        {historyExpanded && (
          <div style={{ maxHeight: "200px", overflow: "auto" }}>
            {logEntries.length === 0 ? (
              <div style={{ padding: "6px 12px", color: "#444444", fontSize: "10px" }}>No commits yet</div>
            ) : logEntries.map((entry) => (
              <div
                key={entry.hash}
                onClick={async () => {
                  if (!dir) return;
                  if (selectedCommitHash === entry.hash) {
                    setSelectedCommitHash(null);
                    setSelectedCommitDetail(null);
                    return;
                  }
                  setSelectedCommitHash(entry.hash);
                  setSelectedCommitDetail(null);
                  try {
                    const detail = await gitShowCommit(dir, entry.hash);
                    setSelectedCommitDetail(detail);
                  } catch (e) {
                    setSelectedCommitDetail(`Error loading commit: ${e}`);
                  }
                }}
                style={{ padding: "4px 12px", display: "flex", flexDirection: "column", gap: "4px", borderBottom: "1px solid #1a1a1a", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                  <span style={{ color: "#ff8c00", fontSize: "9px", fontWeight: "bold", flexShrink: 0, fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace" }}>
                    {entry.short_hash}
                  </span>
                  <span style={{ color: "#cccccc", fontSize: "10px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.message}
                  </span>
                  <span style={{ color: "#444444", fontSize: "9px", flexShrink: 0 }}>{entry.date}</span>
                </div>
                {selectedCommitHash === entry.hash && (
                  <pre style={{
                    margin: 0,
                    padding: "6px",
                    background: "#0d0d0d",
                    border: "1px solid #2a2a2a",
                    color: "#9a9a9a",
                    fontSize: "9px",
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                  }}>
                    {selectedCommitDetail ?? "Loading commit details..."}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Discard All Confirmation Dialog */}
      {discardConfirmOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 99999,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)",
          }}
          onClick={() => { if (!discardLoading) setDiscardConfirmOpen(false); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1a1a1a", border: "1px solid #ff3d00", borderRadius: "8px",
              padding: "20px 24px", maxWidth: "380px", width: "90%",
              boxShadow: "0 8px 32px rgba(255,61,0,0.15), 0 0 0 1px rgba(255,61,0,0.1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ fontSize: "16px", color: "#ff3d00" }}>&#9888;</span>
              <span style={{
                color: "#ff3d00", fontSize: "13px", fontWeight: "bold", letterSpacing: "0.5px",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              }}>
                DISCARD ALL CHANGES
              </span>
            </div>
            <p style={{ color: "#cccccc", fontSize: "12px", lineHeight: "1.5", margin: "0 0 6px" }}>
              This will permanently discard <strong style={{ color: "#ffffff" }}>{totalChanges} file{totalChanges === 1 ? "" : "s"}</strong> with unsaved changes. This action cannot be undone.
            </p>
            <p style={{ color: "#888888", fontSize: "10px", margin: "0 0 18px" }}>
              {workspaceGitStatus!.staged.length > 0 && <span>{workspaceGitStatus!.staged.length} staged, </span>}
              {workspaceGitStatus!.unstaged.length > 0 && <span>{workspaceGitStatus!.unstaged.length} modified, </span>}
              {workspaceGitStatus!.untracked.length > 0 && <span>{workspaceGitStatus!.untracked.length} untracked</span>}
            </p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setDiscardConfirmOpen(false)}
                disabled={discardLoading}
                style={{
                  padding: "6px 16px", background: "transparent", border: "1px solid #444444",
                  color: "#cccccc", fontSize: "11px", fontWeight: "bold", cursor: "pointer",
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                  borderRadius: "4px", letterSpacing: "0.3px",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#ffffff0a"; e.currentTarget.style.borderColor = "#666666"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#444444"; }}
              >
                CANCEL
              </button>
              <button
                onClick={async () => {
                  if (!dir) return;
                  setDiscardLoading(true);
                  try {
                    // Unstage staged files first, then discard
                    for (const c of workspaceGitStatus!.staged) {
                      await gitUnstageFile(dir, c.path);
                    }
                    const allFiles = [
                      ...workspaceGitStatus!.staged.map((c) => c.path),
                      ...workspaceGitStatus!.unstaged.map((c) => c.path),
                      ...workspaceGitStatus!.untracked,
                    ];
                    // Deduplicate (a file can appear in both staged and unstaged)
                    const unique = [...new Set(allFiles)];
                    for (const f of unique) { await gitDiscardFile(dir, f); }
                    addToast("All changes discarded", "success");
                    onRefreshGit();
                    setDiscardConfirmOpen(false);
                  } catch (e) {
                    addToast(`Discard failed: ${e}`, "error");
                  } finally {
                    setDiscardLoading(false);
                  }
                }}
                disabled={discardLoading}
                style={{
                  padding: "6px 16px", background: discardLoading ? "#661a00" : "#cc2200",
                  border: "1px solid #ff3d00", color: "#ffffff", fontSize: "11px", fontWeight: "bold",
                  cursor: discardLoading ? "default" : "pointer",
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                  borderRadius: "4px", letterSpacing: "0.3px",
                }}
                onMouseEnter={(e) => { if (!discardLoading) e.currentTarget.style.background = "#ff3d00"; }}
                onMouseLeave={(e) => { if (!discardLoading) e.currentTarget.style.background = "#cc2200"; }}
              >
                {discardLoading ? "DISCARDING..." : "DISCARD ALL"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});


// ---------------------------------------------------------------------------
// Panel: Hub (opens the overlay HubBrowser)
// ---------------------------------------------------------------------------
const HubPanel = memo(function HubPanel() {
  const { setHubBrowserOpen } = useAppStore();
  return (
    <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ color: "#ff8c00", fontWeight: "bold", fontSize: "10px", letterSpacing: "1px" }}>
        GITHUB HUB
      </div>
      <div style={{ color: "#888888", fontSize: "10px" }}>
        Browse, search, and clone GitHub repositories.
      </div>
      <button
        onClick={() => setHubBrowserOpen(true)}
        style={{
          background: "#1e1e1e", border: "1px solid #00c853", color: "#00c853",
          fontSize: "10px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
          cursor: "pointer", padding: "8px 12px", fontWeight: "bold", letterSpacing: "0.5px",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#00c85322"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#1e1e1e"; }}
      >
        OPEN HUB BROWSER
      </button>
    </div>
  );
});


// ---------------------------------------------------------------------------
// Panel: MCP
// ---------------------------------------------------------------------------
const McpPanel = memo(function McpPanel() {
  const { setMcpManagerOpen } = useAppStore();
  const sessions = useSessionStore((s) => s.sessions);
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId);
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  return (
    <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ color: "#ff8c00", fontWeight: "bold", fontSize: "10px", letterSpacing: "1px" }}>
        MCP SERVERS
      </div>
      <div style={{ color: "#888888", fontSize: "10px" }}>
        Manage Model Context Protocol servers for your workspace.
      </div>
      <button
        onClick={() => {
          const focused = sessions.find((s) => s.id === focusedSessionId);
          setMcpManagerOpen(true, focused?.working_dir ?? activeWorkspace?.repo_path ?? undefined);
        }}
        style={{
          background: "#1e1e1e", border: "1px solid #d500f9", color: "#d500f9",
          fontSize: "10px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
          cursor: "pointer", padding: "8px 12px", fontWeight: "bold", letterSpacing: "0.5px",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#d500f922"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#1e1e1e"; }}
      >
        OPEN MCP MANAGER
      </button>
    </div>
  );
});


// ---------------------------------------------------------------------------
// Panel: Settings
// ---------------------------------------------------------------------------
const SettingsPanel = memo(function SettingsPanel() {
  const { setSettingsOpen, setLicenseDialogOpen } = useWorkspaceStore();
  const { setSkillsPanelOpen, setClaudeMdEditorOpen, setGitSetupWizardOpen, setMcpManagerOpen, setHubBrowserOpen } = useAppStore();
  const addToast = useToastStore((s) => s.addToast);
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const sessions = useSessionStore((s) => s.sessions);
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeSessions = sessions.filter((s) => s.workspace_id === activeWorkspaceId);

  const buttons = [
    { label: "SETTINGS", onClick: () => setSettingsOpen(true), color: "#ff8c00" },
    { label: "MCP SERVERS", onClick: () => {
      const focused = sessions.find((s) => s.id === focusedSessionId);
      setMcpManagerOpen(true, focused?.working_dir ?? activeWorkspace?.repo_path ?? undefined);
    }, color: "#d500f9" },
    { label: "SKILLS", onClick: () => setSkillsPanelOpen(true), color: "#4a9eff" },
    { label: "CLAUDE.md", onClick: () => {
      const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
      if (dir) setClaudeMdEditorOpen(true, dir);
      else addToast("No project directory -- open a session first", "warning");
    }, color: "#ffab00" },
    { label: "GITHUB HUB", onClick: () => setHubBrowserOpen(true), color: "#00c853" },
    { label: "GIT SETUP", onClick: () => setGitSetupWizardOpen(true), color: "#ff8c00" },
    { label: "LICENSE", onClick: () => setLicenseDialogOpen(true), color: "#ff8c00" },
    { label: "CHECK FOR UPDATES", onClick: () => {
      window.open("https://github.com/isaachorowitz/CodeGrid-Claude-Code-Terminal/releases/latest", "_blank");
    }, color: "#888" },
  ];

  return (
    <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ color: "#ff8c00", fontWeight: "bold", fontSize: "10px", letterSpacing: "1px", marginBottom: "4px" }}>
        SETTINGS & TOOLS
      </div>
      {buttons.map((btn) => (
        <button
          key={btn.label}
          onClick={btn.onClick}
          style={{
            background: "#1e1e1e", border: `1px solid ${btn.color}66`, color: btn.color,
            fontSize: "10px", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
            cursor: "pointer", padding: "8px 12px", textAlign: "left", fontWeight: "bold",
            letterSpacing: "0.5px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `${btn.color}15`; e.currentTarget.style.borderColor = btn.color; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#1e1e1e"; e.currentTarget.style.borderColor = `${btn.color}66`; }}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
});


// ---------------------------------------------------------------------------
// Panel widths per type
// ---------------------------------------------------------------------------
const PANEL_WIDTHS: Record<string, number> = {
  files: 286,
  search: 286,
  git: 286,
  settings: 286,
};


// ---------------------------------------------------------------------------
// Main Sidebar export (activity bar + panel)
// ---------------------------------------------------------------------------
export const ACTIVITY_BAR_WIDTH = 40;

export const Sidebar = memo(function Sidebar() {
  const { workspaces, activeWorkspaceId, sidebarOpen, activePanel, togglePanel } = useWorkspaceStore();
  const sessions = useSessionStore((s) => s.sessions);
  const [workspaceGitStatus, setWorkspaceGitStatus] = useState<GitStatusInfo | null>(null);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeSessions = sessions.filter((s) => s.workspace_id === activeWorkspaceId);

  // Fetch git status for active workspace repo
  useEffect(() => {
    const dir = activeWorkspace?.repo_path ?? activeSessions[0]?.working_dir;
    if (!dir) { setWorkspaceGitStatus(null); return; }
    gitStatus(dir).then(setWorkspaceGitStatus).catch(() => setWorkspaceGitStatus(null));
    const interval = setInterval(() => {
      gitStatus(dir).then(setWorkspaceGitStatus).catch(() => setWorkspaceGitStatus(null));
    }, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keying on the first session's dir
  }, [activeWorkspace?.repo_path, activeSessions[0]?.working_dir]);

  const firstSessionDir = activeSessions[0]?.working_dir ?? null;

  const refreshGitStatus = useCallback(async () => {
    const dir = activeWorkspace?.repo_path ?? firstSessionDir;
    if (!dir) return;
    try {
      const s = await gitStatus(dir);
      setWorkspaceGitStatus(s);
    } catch (e) { console.warn("Failed to refresh git status:", e); }
  }, [activeWorkspace?.repo_path, firstSessionDir]);

  const totalChanges = (workspaceGitStatus?.staged.length ?? 0)
    + (workspaceGitStatus?.unstaged.length ?? 0)
    + (workspaceGitStatus?.untracked.length ?? 0);

  const fileTreeDir = activeWorkspace?.repo_path ?? firstSessionDir;

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

  const panelWidth = activePanel ? (PANEL_WIDTHS[activePanel] ?? 220) : 0;
  const showPanel = sidebarOpen && activePanel !== null;

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        gap: "8px",
        flexShrink: 0,
      }}
    >
      {/* Activity Bar (always visible) */}
      <ActivityBar
        activePanel={sidebarOpen ? activePanel : null}
        onToggle={togglePanel}
        gitBadge={totalChanges}
      />

      {/* Panel content area */}
      <div
        style={{
          width: showPanel ? `${panelWidth}px` : "0px",
          overflow: "hidden",
          transition: "width 0.2s ease",
          background: "rgba(20, 20, 20, 0.9)",
          border: showPanel ? "1px solid #2a2a2a" : "none",
          borderRadius: showPanel ? "12px" : "0px",
          boxShadow: showPanel ? "0 10px 24px rgba(0, 0, 0, 0.35)" : "none",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: "12px",
          flexShrink: 0,
          contain: "content",
        }}
      >
        {/* Panel header */}
        {showPanel && (
          <div style={{
            padding: "8px 12px",
            borderBottom: "1px solid #2a2a2a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <span style={{ color: "#ff8c00", fontWeight: "bold", fontSize: "10px", letterSpacing: "1px" }}>
              {activePanel === "files" ? "FILES" :
               activePanel === "search" ? "SEARCH" :
               activePanel === "git" ? "SOURCE CONTROL" :
               activePanel === "settings" ? "SETTINGS & TOOLS" : ""}
            </span>
            <span style={{ color: "#555555", fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100px" }}>
              {activeWorkspace?.name ?? ""}
            </span>
          </div>
        )}

        {/* Panel body */}
        {showPanel && activePanel === "files" && (
          <FilesPanel fileTreeDir={fileTreeDir} gitChangesMap={gitChangesMap} />
        )}
        {showPanel && activePanel === "search" && fileTreeDir && (
          <ProjectSearch rootPath={fileTreeDir} />
        )}
        {showPanel && activePanel === "search" && !fileTreeDir && (
          <div style={{ padding: "16px 12px", color: "#555555", fontSize: "10px" }}>
            Open a session to search files.
          </div>
        )}
        {showPanel && activePanel === "git" && (
          <GitPanel
            workspaceGitStatus={workspaceGitStatus}
            activeWorkspace={activeWorkspace ? { repo_path: activeWorkspace.repo_path, name: activeWorkspace.name } : undefined}
            activeSessions={activeSessions}
            onRefreshGit={refreshGitStatus}
          />
        )}
        {showPanel && activePanel === "settings" && <SettingsPanel />}
      </div>
    </div>
  );
});
