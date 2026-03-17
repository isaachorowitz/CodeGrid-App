import { memo, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSessionStore } from "../stores/sessionStore";
import { useAppStore } from "../stores/appStore";
import { useToastStore } from "../stores/toastStore";
import type { GitHubRepo, RepoQuickStatus } from "../lib/ipc";
import { vibeLabel } from "../lib/vibeMode";

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
  const { newSessionDialogOpen, setNewSessionDialogOpen, activeWorkspaceId, workspaces } = useWorkspaceStore();
  const allSessions = useSessionStore((s) => s.sessions);
  const recentDirs = useAppStore((s) => s.recentDirs);
  const addToast = useToastStore((s) => s.addToast);

  // Determine the current workspace's working directory for "Same Project" quick action
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const workspaceSessions = useMemo(
    () => allSessions.filter((s) => s.workspace_id === activeWorkspaceId),
    [allSessions, activeWorkspaceId],
  );
  const currentProjectDir = activeWorkspace?.repo_path ?? workspaceSessions[0]?.working_dir ?? null;
  const [tab, setTab] = useState<"recent" | "browse" | "clone" | "github">("recent");
  const [path, setPath] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneTargetDir, setCloneTargetDir] = useState("");
  const [resume, setResume] = useState(false);
  const [sessionType, setSessionType] = useState<"claude" | "shell">("claude");
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Repo quick status for recent dirs
  const [repoStatuses, setRepoStatuses] = useState<Record<string, RepoQuickStatus>>({});

  // GitHub tab state
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [ghSearch, setGhSearch] = useState("");
  const [ghLoading, setGhLoading] = useState(false);
  const [ghCloning, setGhCloning] = useState<string | null>(null);
  const ghSearchRef = useRef<HTMLInputElement>(null);
  const ghSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (newSessionDialogOpen) {
      setPath("");
      setCloneUrl("");
      setCloneTargetDir("");
      setResume(false);
      setSessionType("claude");
      setFilter("");
      setGhSearch("");
      setGhRepos([]);
      setGhCloning(null);
      setTab(recentDirs.length > 0 ? "recent" : "browse");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [newSessionDialogOpen, recentDirs.length]);

  // Default clone destination: ~/Projects
  useEffect(() => {
    if (!newSessionDialogOpen) return;
    (async () => {
      try {
        const { getHomeDir } = await import("../lib/ipc");
        const home = await getHomeDir();
        setCloneTargetDir(`${home}/Projects`);
      } catch {
        // Keep empty and let backend fallback if home can't be resolved
      }
    })();
  }, [newSessionDialogOpen]);

  // Fetch repo statuses for recent dirs (batch, non-blocking)
  useEffect(() => {
    if (!newSessionDialogOpen || recentDirs.length === 0) return;
    let cancelled = false;
    (async () => {
      const { checkRepoStatus } = await import("../lib/ipc");
      const results: Record<string, RepoQuickStatus> = {};
      // Process in batches of 10 to avoid flooding
      for (let i = 0; i < recentDirs.length; i += 10) {
        if (cancelled) break;
        const batch = recentDirs.slice(i, i + 10);
        const statuses = await Promise.all(
          batch.map(async (dir) => {
            try {
              const status = await checkRepoStatus(dir);
              return [dir, status] as const;
            } catch {
              return [dir, { is_git: false, has_remote: false, branch: null }] as const;
            }
          }),
        );
        for (const [dir, status] of statuses) {
          results[dir] = status;
        }
        if (!cancelled) setRepoStatuses({ ...results });
      }
    })();
    return () => { cancelled = true; };
  }, [newSessionDialogOpen, recentDirs]);

  // GitHub identity (username + orgs)
  const [ghIdentity, setGhIdentity] = useState<{ username: string; orgs: string[] } | null>(null);

  // Load GitHub repos when tab switches to github — personal + all orgs
  useEffect(() => {
    if (tab !== "github") return;
    setGhLoading(true);
    (async () => {
      try {
        const { listGithubRepos, getGithubIdentity } = await import("../lib/ipc");

        // Get identity first
        const identity = await getGithubIdentity().catch(() => null);
        if (identity) setGhIdentity(identity);

        // Load personal repos
        const personalRepos = await listGithubRepos(undefined, 100);

        // Load org repos in parallel
        const orgNames = identity?.orgs ?? [];
        const orgResults = await Promise.allSettled(
          orgNames.map((org) => listGithubRepos(org, 100))
        );

        // Merge all repos, dedup by full_name
        const allRepos = [...personalRepos];
        const seen = new Set(allRepos.map((r) => r.full_name));
        for (const result of orgResults) {
          if (result.status === "fulfilled") {
            for (const repo of result.value) {
              if (!seen.has(repo.full_name)) {
                seen.add(repo.full_name);
                allRepos.push(repo);
              }
            }
          }
        }

        setGhRepos(allRepos);
      } catch (e) {
        addToast(`Failed to load GitHub repos: ${e}`, "error", 5000);
      } finally {
        setGhLoading(false);
      }
    })();
    setTimeout(() => ghSearchRef.current?.focus(), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only load repos on tab switch
  }, [tab]);

  // GitHub search with debounce
  const handleGhSearch = useCallback((query: string) => {
    setGhSearch(query);
    if (ghSearchTimer.current) clearTimeout(ghSearchTimer.current);
    if (!query.trim()) {
      // Reset to user repos
      setGhLoading(true);
      (async () => {
        try {
          const { listGithubRepos } = await import("../lib/ipc");
          const repos = await listGithubRepos(undefined, 30);
          setGhRepos(repos);
        } catch (e) { console.warn("Failed to load GitHub repos:", e); } finally {
          setGhLoading(false);
        }
      })();
      return;
    }
    ghSearchTimer.current = setTimeout(async () => {
      setGhLoading(true);
      try {
        const { searchGithubRepos } = await import("../lib/ipc");
        const repos = await searchGithubRepos(query.trim(), 20);
        setGhRepos(repos);
      } catch (e) {
        addToast(`GitHub search failed: ${e}`, "error", 4000);
      } finally {
        setGhLoading(false);
      }
    }, 400);
  }, [addToast]);

  const handleSubmit = useCallback(
    (dir?: string) => {
      const finalDir = dir ?? (path.trim() || "~");
      onCreateSession(finalDir, false, resume, sessionType === "shell");
      setNewSessionDialogOpen(false);
    },
    [path, resume, sessionType, onCreateSession, setNewSessionDialogOpen],
  );

  const handleClone = useCallback(async () => {
    if (!cloneUrl.trim()) return;
    try {
      const { cloneRepo } = await import("../lib/ipc");
      const targetDir = cloneTargetDir.trim() || undefined;
      const clonedPath = await cloneRepo(cloneUrl.trim(), targetDir);
      onCreateSession(clonedPath, false, false, false);
      setNewSessionDialogOpen(false);
    } catch (e) {
      addToast(`Clone failed: ${e}`, "error", 5000);
    }
  }, [cloneUrl, cloneTargetDir, onCreateSession, setNewSessionDialogOpen, addToast]);

  const handleGhCloneAndOpen = useCallback(async (repo: GitHubRepo) => {
    setGhCloning(repo.full_name);
    try {
      const { cloneRepo } = await import("../lib/ipc");
      const targetDir = cloneTargetDir.trim() || undefined;
      const clonedPath = await cloneRepo(repo.clone_url, targetDir);
      onCreateSession(clonedPath, false, false, sessionType === "shell");
      setNewSessionDialogOpen(false);
    } catch (e) {
      console.error("Clone failed:", e);
      addToast(`Clone failed: ${e}`, "error", 5000);
    } finally {
      setGhCloning(null);
    }
  }, [cloneTargetDir, onCreateSession, setNewSessionDialogOpen, sessionType, addToast]);

  const handlePickCloneDestination = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false, title: "Choose clone destination" });
      if (selected) setCloneTargetDir(selected as string);
    } catch {
      // Not in Tauri
    }
  }, []);

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

  const filteredDirs = useMemo(() => {
    if (!filter) return recentDirs;
    const lowerFilter = filter.toLowerCase();
    return recentDirs.filter((d) =>
      d.toLowerCase().includes(lowerFilter) ||
      folderName(d).toLowerCase().includes(lowerFilter),
    );
  }, [recentDirs, filter]);

  if (!newSessionDialogOpen) return null;

  const tabs = [
    { id: "recent" as const, label: "RECENT", count: filteredDirs.length },
    { id: "github" as const, label: "GITHUB" },
    { id: "browse" as const, label: "BROWSE" },
    { id: "clone" as const, label: "CLONE" },
  ];

  // Language color map for GitHub repos
  const langColors: Record<string, string> = {
    TypeScript: "#3178c6", JavaScript: "#f7df1e", Python: "#3572a5", Rust: "#dea584",
    Go: "#00add8", Java: "#b07219", Ruby: "#701516", C: "#555555", "C++": "#f34b7d",
    "C#": "#178600", Swift: "#f05138", Kotlin: "#a97bff", Dart: "#00b4ab",
    HTML: "#e34c26", CSS: "#563d7c", Shell: "#89e051", Lua: "#000080",
  };

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
        role="dialog"
        aria-modal="true"
        aria-label="New Session"
        style={{
          position: "relative",
          width: "580px",
          maxHeight: "600px",
          background: "#141414",
          border: "1px solid #ff8c00",
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
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

        {/* Session type selector */}
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
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
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

        {/* Same Project quick button */}
        {currentProjectDir && (
          <div style={{ padding: "8px 16px", borderBottom: "1px solid #2a2a2a" }}>
            <button
              onClick={() => handleSubmit(currentProjectDir)}
              style={{
                width: "100%",
                background: "#ff8c0015",
                border: "1px solid #ff8c00",
                color: "#ff8c00",
                fontSize: "12px",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                cursor: "pointer",
                padding: "10px 12px",
                fontWeight: "bold",
                letterSpacing: "0.5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#ff8c0030")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#ff8c0015")}
            >
              SAME PROJECT — {currentProjectDir.split("/").pop()}
              <span style={{ fontSize: "9px", opacity: 0.7, fontWeight: "normal" }}>
                {currentProjectDir.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~")}
              </span>
            </button>
          </div>
        )}

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
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
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
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                    padding: "8px",
                    outline: "none",
                    boxSizing: "border-box",
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
                filteredDirs.map((dir) => {
                  const status = repoStatuses[dir];
                  return (
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
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ color: "#e0e0e0", fontSize: "12px", fontWeight: "bold" }}>
                            {folderName(dir)}
                          </span>
                          {/* Git & remote badges */}
                          {status?.is_git && (
                            <span style={{
                              fontSize: "8px",
                              fontWeight: "bold",
                              padding: "1px 4px",
                              border: "1px solid #555555",
                              color: "#888888",
                              letterSpacing: "0.5px",
                            }}>
                              git
                            </span>
                          )}
                          {status?.has_remote && (
                            <span style={{
                              fontSize: "8px",
                              fontWeight: "bold",
                              padding: "1px 4px",
                              color: "#00c853",
                              letterSpacing: "0.5px",
                            }}>
                              &#x21D4;
                            </span>
                          )}
                          {status?.branch && (
                            <span style={{
                              fontSize: "9px",
                              color: "#d500f9",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "80px",
                            }}>
                              {status.branch}
                            </span>
                          )}
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
                  );
                })
              )}
              {/* Footer note */}
              <div style={{
                padding: "10px 16px",
                borderTop: "1px solid #1e1e1e",
                color: "#444444",
                fontSize: "9px",
                textAlign: "center",
                letterSpacing: "0.3px",
              }}>
                Showing projects found on your machine. Use GITHUB tab to clone from GitHub.
              </div>
            </div>
          )}

          {/* GitHub tab */}
          {tab === "github" && (
            <div>
              <div style={{ padding: "8px 16px" }}>
                <input
                  ref={ghSearchRef}
                  value={ghSearch}
                  onChange={(e) => handleGhSearch(e.target.value)}
                  placeholder="Search GitHub repos..."
                  style={{
                    width: "100%",
                    background: "#0a0a0a",
                    border: "1px solid #2a2a2a",
                    color: "#e0e0e0",
                    fontSize: "12px",
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                    padding: "8px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#00c853")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                />
              </div>
              <div style={{ padding: "0 16px 8px 16px" }}>
                <div style={{ color: "#666666", fontSize: "9px", marginBottom: "4px", letterSpacing: "0.4px" }}>
                  CLONE DESTINATION
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  <input
                    value={cloneTargetDir}
                    onChange={(e) => setCloneTargetDir(e.target.value)}
                    placeholder="~/Projects (or absolute path)"
                    style={{
                      flex: 1,
                      background: "#0a0a0a",
                      border: "1px solid #2a2a2a",
                      color: "#e0e0e0",
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                      padding: "6px 8px",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#00c853")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                  />
                  <button
                    onClick={handlePickCloneDestination}
                    style={{
                      background: "#1e1e1e",
                      border: "1px solid #2a2a2a",
                      color: "#888888",
                      fontSize: "10px",
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                      cursor: "pointer",
                      padding: "6px 10px",
                      fontWeight: "bold",
                    }}
                  >
                    BROWSE
                  </button>
                </div>
              </div>
              {ghLoading && (
                <div style={{ padding: "20px", textAlign: "center", color: "#555555", fontSize: "11px" }}>
                  Loading...
                </div>
              )}
              {/* Identity + org filter */}
              {ghIdentity && !ghSearch && (
                <div style={{ padding: "6px 16px", borderBottom: "1px solid #1e1e1e", display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: "9px", color: "#555", marginRight: "4px" }}>SHOWING:</span>
                  <button onClick={() => handleGhSearch("")} style={{
                    background: "#1e1e1e", border: "1px solid #00c853", color: "#00c853",
                    fontSize: "9px", padding: "2px 6px", cursor: "pointer", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                  }}>{ghIdentity.username}</button>
                  {ghIdentity.orgs.map((org) => (
                    <button key={org} style={{
                      background: "#1e1e1e", border: "1px solid #4a9eff", color: "#4a9eff",
                      fontSize: "9px", padding: "2px 6px", cursor: "default", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                    }}>{org}</button>
                  ))}
                  <span style={{ fontSize: "9px", color: "#444", marginLeft: "auto" }}>{ghRepos.length} repos</span>
                </div>
              )}
              {!ghLoading && ghRepos.length === 0 && (
                <div style={{ padding: "20px", textAlign: "center", color: "#555555", fontSize: "11px" }}>
                  {ghSearch ? "No repos found. Try a different search." : "No repos found. Make sure GitHub CLI is authenticated."}
                </div>
              )}
              {!ghLoading && ghRepos.map((repo) => (
                <div
                  key={repo.full_name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 16px",
                    gap: "12px",
                    borderBottom: "1px solid #1a1a1a",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1e1e1e")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: "#e0e0e0", fontSize: "12px", fontWeight: "bold" }}>
                        {repo.name}
                      </span>
                      {repo.is_private && (
                        <span style={{
                          fontSize: "8px", padding: "1px 4px", border: "1px solid #ff8c00",
                          color: "#ff8c00", fontWeight: "bold",
                        }}>PRIVATE</span>
                      )}
                      {repo.is_fork && (
                        <span style={{
                          fontSize: "8px", padding: "1px 4px", border: "1px solid #555555",
                          color: "#555555",
                        }}>FORK</span>
                      )}
                      {repo.language && (
                        <span style={{
                          fontSize: "9px",
                          color: langColors[repo.language] ?? "#888888",
                          fontWeight: "bold",
                        }}>
                          {repo.language}
                        </span>
                      )}
                    </div>
                    {repo.description && (
                      <div style={{
                        color: "#666666", fontSize: "10px", marginTop: "2px",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {repo.description}
                      </div>
                    )}
                    <div style={{ color: "#444444", fontSize: "9px", marginTop: "2px" }}>
                      {repo.full_name}
                      {repo.stars > 0 && <span style={{ marginLeft: "8px" }}>* {repo.stars}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleGhCloneAndOpen(repo)}
                    disabled={ghCloning !== null}
                    style={{
                      background: ghCloning === repo.full_name ? "#2a2a2a" : "#00c853",
                      border: "none",
                      color: ghCloning === repo.full_name ? "#555555" : "#0a0a0a",
                      fontSize: "9px",
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                      cursor: ghCloning !== null ? "default" : "pointer",
                      padding: "6px 10px",
                      fontWeight: "bold",
                      letterSpacing: "0.5px",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ghCloning === repo.full_name ? "CLONING..." : "CLONE & OPEN"}
                  </button>
                </div>
              ))}
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
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
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
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
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
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
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
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
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
              <div style={{ color: "#888888", fontSize: "10px", marginBottom: "6px", letterSpacing: "0.5px" }}>
                DESTINATION FOLDER
              </div>
              <div style={{ display: "flex", gap: "4px", marginBottom: "10px" }}>
                <input
                  value={cloneTargetDir}
                  onChange={(e) => setCloneTargetDir(e.target.value)}
                  placeholder="~/Projects (or absolute path)"
                  style={{
                    flex: 1,
                    background: "#0a0a0a",
                    border: "1px solid #2a2a2a",
                    color: "#e0e0e0",
                    fontSize: "13px",
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                    padding: "10px",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#ff8c00")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                />
                <button
                  onClick={handlePickCloneDestination}
                  style={{
                    background: "#1e1e1e",
                    border: "1px solid #2a2a2a",
                    color: "#888888",
                    fontSize: "11px",
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                    cursor: "pointer",
                    padding: "10px 12px",
                    fontWeight: "bold",
                  }}
                >
                  BROWSE
                </button>
              </div>
              <div style={{ color: "#555555", fontSize: "10px", marginBottom: "16px" }}>
                Repo will be saved in this folder and then opened automatically
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
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
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
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
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
