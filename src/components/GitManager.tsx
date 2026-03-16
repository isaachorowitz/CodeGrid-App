import { memo, useState, useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../stores/appStore";
import { useToastStore } from "../stores/toastStore";
import {
  gitStatus, gitPush, gitPull, gitCommit, gitStageFile, gitUnstageFile,
  gitCreateBranch, gitSwitchBranch, gitListBranches, gitLog, gitDiscardFile,
  gitFetch, gitStash,
  type GitStatusInfo, type GitBranchInfo, type GitLogEntry,
} from "../lib/ipc";

type Tab = "changes" | "branches" | "log";

const STATUS_ICON: Record<string, { label: string; color: string }> = {
  modified: { label: "M", color: "#ffab00" },
  added: { label: "A", color: "#00c853" },
  deleted: { label: "D", color: "#ff3d00" },
  renamed: { label: "R", color: "#4a9eff" },
};

export const GitManager = memo(function GitManager() {
  const { gitManagerOpen, setGitManagerOpen, gitManagerDir } = useAppStore();
  const [tab, setTab] = useState<Tab>("changes");
  const [status, setStatus] = useState<GitStatusInfo | null>(null);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [logEntries, setLogEntries] = useState<GitLogEntry[]>([]);
  const [commitMsg, setCommitMsg] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const addToast = useToastStore((s) => s.addToast);
  const dir = gitManagerDir ?? "";
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup flash timer on unmount
  useEffect(() => {
    return () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); };
  }, []);

  const refresh = useCallback(async () => {
    if (!dir) return;
    try {
      const s = await gitStatus(dir);
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [dir]);

  const refreshBranches = useCallback(async () => {
    if (!dir) return;
    try { setBranches(await gitListBranches(dir)); } catch {}
  }, [dir]);

  const refreshLog = useCallback(async () => {
    if (!dir) return;
    try { setLogEntries(await gitLog(dir, 30)); } catch {}
  }, [dir]);

  useEffect(() => {
    if (gitManagerOpen && dir) {
      refresh();
      if (tab === "branches") refreshBranches();
      if (tab === "log") refreshLog();
    }
  }, [gitManagerOpen, dir, tab]);

  const flash = (msg: string) => {
    setSuccess(msg);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setSuccess(null), 2000);
  };

  const handlePush = useCallback(async () => {
    setLoading("push");
    try {
      await gitPush(dir, !status?.has_remote);
      flash("Pushed successfully");
      await refresh();
    } catch (e) { setError(String(e)); }
    setLoading("");
  }, [dir, status, refresh]);

  const handlePull = useCallback(async () => {
    setLoading("pull");
    try {
      await gitPull(dir);
      flash("Pulled successfully");
      await refresh();
    } catch (e) { setError(String(e)); }
    setLoading("");
  }, [dir, refresh]);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) return;
    setLoading("commit");
    try {
      const stageAll = (status?.unstaged.length ?? 0) > 0 || (status?.untracked.length ?? 0) > 0;
      await gitCommit(dir, commitMsg.trim(), stageAll);
      setCommitMsg("");
      flash("Committed");
      await refresh();
    } catch (e) { setError(String(e)); }
    setLoading("");
  }, [dir, commitMsg, status, refresh]);

  const handleStage = useCallback(async (path: string) => {
    try { await gitStageFile(dir, path); await refresh(); } catch (e) { setError(String(e)); }
  }, [dir, refresh]);

  const handleUnstage = useCallback(async (path: string) => {
    try { await gitUnstageFile(dir, path); await refresh(); } catch (e) { setError(String(e)); }
  }, [dir, refresh]);

  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);

  const handleDiscard = useCallback(async (path: string) => {
    if (confirmDiscard !== path) {
      setConfirmDiscard(path);
      // Auto-clear confirm state after 3 seconds
      setTimeout(() => setConfirmDiscard(null), 3000);
      return;
    }
    setConfirmDiscard(null);
    try { await gitDiscardFile(dir, path); await refresh(); } catch (e) { setError(String(e)); }
  }, [dir, refresh, confirmDiscard]);

  const handleNewBranch = useCallback(async () => {
    if (!newBranch.trim()) return;
    try {
      await gitCreateBranch(dir, newBranch.trim(), true);
      setNewBranch("");
      flash(`Switched to ${newBranch.trim()}`);
      await refresh();
      await refreshBranches();
    } catch (e) { setError(String(e)); }
  }, [dir, newBranch, refresh, refreshBranches]);

  const handleSwitchBranch = useCallback(async (name: string) => {
    try {
      await gitSwitchBranch(dir, name.replace(/^origin\//, ""));
      flash(`Switched to ${name}`);
      await refresh();
      await refreshBranches();
    } catch (e) { setError(String(e)); }
  }, [dir, refresh, refreshBranches]);

  if (!gitManagerOpen) return null;

  const totalChanges = (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", justifyContent: "center", paddingTop: "40px" }}
      onClick={() => setGitManagerOpen(false)}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Git Manager"
        style={{
          position: "relative", width: "600px", maxHeight: "600px", background: "#141414",
          border: "1px solid #ff8c00", fontFamily: "'SF Mono', 'Menlo', monospace", zIndex: 1,
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a2a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "#ff8c00", fontSize: "12px", fontWeight: "bold", letterSpacing: "1px" }}>
              GIT MANAGER
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px", alignItems: "center" }}>
              {status && (
                <>
                  <span style={{ color: "#d500f9", fontSize: "11px", fontWeight: "bold" }}>{status.branch}</span>
                  {status.ahead > 0 && <span style={{ color: "#00c853", fontSize: "10px" }}>+{status.ahead}</span>}
                  {status.behind > 0 && <span style={{ color: "#ff3d00", fontSize: "10px" }}>-{status.behind}</span>}
                </>
              )}
              <span style={{ color: "#555555", fontSize: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {dir.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~")}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            {/* Fetch / Stash / Pull / Push buttons */}
            <button onClick={async () => {
              setLoading("fetch");
              try { await gitFetch(dir); flash("Fetched"); } catch (e) { setError(String(e)); }
              setLoading("");
            }} disabled={loading === "fetch"} style={{
              background: "#1e1e1e", border: "1px solid #2a2a2a", color: loading === "fetch" ? "#ffab00" : "#888888",
              fontSize: "10px", fontFamily: "'SF Mono', monospace", cursor: "pointer", padding: "4px 8px",
            }}>
              {loading === "fetch" ? "..." : "FETCH"}
            </button>
            <button onClick={async () => {
              setLoading("stash");
              try { await gitStash(dir, false); flash("Stashed"); await refresh(); } catch (e) { setError(String(e)); }
              setLoading("");
            }} style={{
              background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888888",
              fontSize: "10px", fontFamily: "'SF Mono', monospace", cursor: "pointer", padding: "4px 8px",
            }}>
              STASH
            </button>
            <button onClick={handlePull} disabled={loading === "pull"} aria-label="Pull from remote" style={{
              background: "#1e1e1e", border: "1px solid #2a2a2a", color: loading === "pull" ? "#ffab00" : "#4a9eff",
              fontSize: "10px", fontFamily: "'SF Mono', monospace", cursor: "pointer", padding: "4px 10px", fontWeight: "bold",
            }}>
              {loading === "pull" ? "PULLING..." : "PULL"}
            </button>
            <button onClick={handlePush} disabled={loading === "push"} aria-label="Push to remote" style={{
              background: "#1e1e1e", border: "1px solid #2a2a2a", color: loading === "push" ? "#ffab00" : "#00c853",
              fontSize: "10px", fontFamily: "'SF Mono', monospace", cursor: "pointer", padding: "4px 10px", fontWeight: "bold",
            }}>
              {loading === "push" ? "PUSHING..." : "PUSH"}
              {status && status.ahead > 0 && <span style={{ marginLeft: "4px", opacity: 0.7 }}>({status.ahead})</span>}
            </button>
            <button onClick={() => setGitManagerOpen(false)} style={{
              background: "none", border: "none", color: "#555555", fontSize: "14px", cursor: "pointer",
              fontFamily: "'SF Mono', monospace", marginLeft: "8px",
            }}>x</button>
          </div>
        </div>

        {/* Feedback */}
        {error && <div style={{ padding: "6px 16px", background: "#ff3d0022", color: "#ff3d00", fontSize: "10px" }}>{error}</div>}
        {success && <div style={{ padding: "6px 16px", background: "#00c85322", color: "#00c853", fontSize: "10px" }}>{success}</div>}

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a" }}>
          {([
            { id: "changes" as Tab, label: "Changes", count: totalChanges },
            { id: "branches" as Tab, label: "Branches", count: branches.length },
            { id: "log" as Tab, label: "History" },
          ]).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "8px", background: tab === t.id ? "#1e1e1e" : "transparent",
              border: "none", borderBottom: tab === t.id ? "2px solid #ff8c00" : "2px solid transparent",
              color: tab === t.id ? "#ff8c00" : "#555555", fontSize: "10px", fontFamily: "'SF Mono', monospace",
              cursor: "pointer", letterSpacing: "0.5px",
            }}>
              {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {tab === "changes" && status && (
            <div>
              {/* Commit box */}
              <div style={{ padding: "8px 16px", borderBottom: "1px solid #2a2a2a" }}>
                <div style={{ display: "flex", gap: "4px" }}>
                  <input
                    value={commitMsg}
                    onChange={(e) => setCommitMsg(e.target.value)}
                    placeholder="Commit message..."
                    style={{ flex: 1, background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "11px", fontFamily: "'SF Mono', monospace", padding: "6px 8px", outline: "none" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#ff8c00")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCommit(); }}
                  />
                  <button onClick={handleCommit} disabled={!commitMsg.trim() || loading === "commit"} style={{
                    background: commitMsg.trim() ? "#ff8c00" : "#2a2a2a", border: "none",
                    color: commitMsg.trim() ? "#0a0a0a" : "#555555", fontSize: "10px",
                    fontFamily: "'SF Mono', monospace", cursor: commitMsg.trim() ? "pointer" : "default",
                    padding: "6px 12px", fontWeight: "bold",
                  }}>
                    {loading === "commit" ? "..." : "COMMIT ALL"}
                  </button>
                </div>
                <div style={{ color: "#555555", fontSize: "9px", marginTop: "2px" }}>Cmd+Enter to commit</div>
              </div>

              {/* Staged */}
              {status.staged.length > 0 && (
                <div>
                  <div style={{ padding: "6px 16px", fontSize: "9px", color: "#00c853", letterSpacing: "1px", fontWeight: "bold" }}>STAGED ({status.staged.length})</div>
                  {status.staged.map((f) => (
                    <FileRow key={`s-${f.path}`} path={f.path} status={f.status} onAction={() => handleUnstage(f.path)} actionLabel="UNSTAGE" actionColor="#ffab00" />
                  ))}
                </div>
              )}

              {/* Unstaged */}
              {status.unstaged.length > 0 && (
                <div>
                  <div style={{ padding: "6px 16px", fontSize: "9px", color: "#ffab00", letterSpacing: "1px", fontWeight: "bold" }}>MODIFIED ({status.unstaged.length})</div>
                  {status.unstaged.map((f) => (
                    <FileRow key={`u-${f.path}`} path={f.path} status={f.status} onAction={() => handleStage(f.path)} actionLabel="STAGE"
                      actionColor="#00c853" secondAction={() => handleDiscard(f.path)} secondLabel={confirmDiscard === f.path ? "CONFIRM?" : "DISCARD"} />
                  ))}
                </div>
              )}

              {/* Untracked */}
              {status.untracked.length > 0 && (
                <div>
                  <div style={{ padding: "6px 16px", fontSize: "9px", color: "#4a9eff", letterSpacing: "1px", fontWeight: "bold" }}>UNTRACKED ({status.untracked.length})</div>
                  {status.untracked.map((p) => (
                    <FileRow key={`t-${p}`} path={p} status="added" onAction={() => handleStage(p)} actionLabel="STAGE" actionColor="#00c853" />
                  ))}
                </div>
              )}

              {totalChanges === 0 && (
                <div style={{ padding: "24px", textAlign: "center", color: "#555555", fontSize: "11px" }}>
                  Working tree clean — no changes
                </div>
              )}
            </div>
          )}

          {tab === "branches" && (
            <div>
              {/* New branch */}
              <div style={{ padding: "8px 16px", borderBottom: "1px solid #2a2a2a", display: "flex", gap: "4px" }}>
                <input
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="New branch name..."
                  style={{ flex: 1, background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "11px", fontFamily: "'SF Mono', monospace", padding: "6px 8px", outline: "none" }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleNewBranch(); }}
                />
                <button onClick={handleNewBranch} disabled={!newBranch.trim()} style={{
                  background: newBranch.trim() ? "#ff8c00" : "#2a2a2a", border: "none",
                  color: newBranch.trim() ? "#0a0a0a" : "#555555", fontSize: "10px",
                  fontFamily: "'SF Mono', monospace", cursor: newBranch.trim() ? "pointer" : "default",
                  padding: "6px 12px", fontWeight: "bold",
                }}>CREATE</button>
              </div>

              {/* Local branches */}
              <div style={{ padding: "6px 16px", fontSize: "9px", color: "#ff8c00", letterSpacing: "1px", fontWeight: "bold" }}>LOCAL</div>
              {branches.filter((b) => !b.is_remote).map((b) => (
                <div
                  key={b.name}
                  onClick={() => !b.is_current && handleSwitchBranch(b.name)}
                  style={{
                    display: "flex", alignItems: "center", padding: "6px 16px", gap: "8px",
                    cursor: b.is_current ? "default" : "pointer",
                    background: b.is_current ? "#1e1e1e" : "transparent",
                    borderLeft: b.is_current ? "2px solid #ff8c00" : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => { if (!b.is_current) e.currentTarget.style.background = "#1a1a1a"; }}
                  onMouseLeave={(e) => { if (!b.is_current) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color: b.is_current ? "#ff8c00" : "#e0e0e0", fontSize: "11px", fontWeight: b.is_current ? "bold" : "normal" }}>{b.name}</span>
                  {b.is_current && <span style={{ color: "#00c853", fontSize: "9px" }}>CURRENT</span>}
                  <span style={{ color: "#555555", fontSize: "10px", marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "250px" }}>{b.last_commit}</span>
                </div>
              ))}

              {/* Remote branches */}
              {branches.some((b) => b.is_remote) && (
                <>
                  <div style={{ padding: "6px 16px", fontSize: "9px", color: "#4a9eff", letterSpacing: "1px", fontWeight: "bold", marginTop: "4px" }}>REMOTE</div>
                  {branches.filter((b) => b.is_remote).map((b) => (
                    <div
                      key={b.name}
                      onClick={() => handleSwitchBranch(b.name)}
                      style={{ display: "flex", alignItems: "center", padding: "6px 16px", gap: "8px", cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ color: "#888888", fontSize: "11px" }}>{b.name}</span>
                      <span style={{ color: "#555555", fontSize: "10px", marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "250px" }}>{b.last_commit}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "log" && (
            <div>
              {logEntries.map((entry) => (
                <div key={entry.hash} style={{ display: "flex", padding: "6px 16px", gap: "8px", borderBottom: "1px solid #1e1e1e" }}>
                  <span style={{ color: "#ff8c00", fontSize: "10px", fontWeight: "bold", flexShrink: 0, minWidth: "56px" }}>{entry.short_hash}</span>
                  <span style={{ color: "#e0e0e0", fontSize: "11px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.message}</span>
                  <span style={{ color: "#555555", fontSize: "10px", flexShrink: 0 }}>{entry.date}</span>
                </div>
              ))}
              {logEntries.length === 0 && (
                <div style={{ padding: "24px", textAlign: "center", color: "#555555", fontSize: "11px" }}>No commits yet</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// File row component
function FileRow({ path, status, onAction, actionLabel, actionColor, secondAction, secondLabel }: {
  path: string; status: string; onAction: () => void; actionLabel: string; actionColor: string;
  secondAction?: () => void; secondLabel?: string;
}) {
  const icon = STATUS_ICON[status] ?? { label: "?", color: "#888888" };
  return (
    <div
      style={{ display: "flex", alignItems: "center", padding: "4px 16px", gap: "8px", fontSize: "11px" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ color: icon.color, fontWeight: "bold", width: "14px", textAlign: "center", fontSize: "10px" }}>{icon.label}</span>
      <span style={{ color: "#e0e0e0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
      {secondAction && (
        <button onClick={(e) => { e.stopPropagation(); secondAction(); }} style={{
          background: "none", border: "1px solid #ff3d0066", color: "#ff3d00", fontSize: "8px",
          fontFamily: "'SF Mono', monospace", cursor: "pointer", padding: "1px 4px",
        }}>{secondLabel}</button>
      )}
      <button onClick={(e) => { e.stopPropagation(); onAction(); }} style={{
        background: "none", border: `1px solid ${actionColor}66`, color: actionColor, fontSize: "8px",
        fontFamily: "'SF Mono', monospace", cursor: "pointer", padding: "1px 4px",
      }}>{actionLabel}</button>
    </div>
  );
}
