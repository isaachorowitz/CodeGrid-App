import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Types matching Rust structs
export interface SessionInfo {
  id: string;
  workspace_id: string;
  working_dir: string;
  command: string;
  git_branch: string | null;
  status: "idle" | "running" | "waiting" | "error" | "dead";
  created_at: string;
  pane_number: number;
  worktree_path: string | null;
}

export interface PtyOutput {
  session_id: string;
  data: number[];
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  layout_json: string | null;
  created_at: string;
  is_active: boolean;
  repo_path: string | null;
}

// Session commands
export async function createSession(
  workingDir: string,
  workspaceId: string,
  useWorktree: boolean = false,
  resume: boolean = false,
): Promise<SessionInfo> {
  return invoke("create_session", {
    workingDir,
    workspaceId,
    useWorktree,
    resume,
  });
}

export async function writeToPty(
  sessionId: string,
  data: Uint8Array,
): Promise<void> {
  return invoke("write_to_pty", {
    sessionId,
    data: Array.from(data),
  });
}

export async function resizePty(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("resize_pty", { sessionId, cols, rows });
}

export async function killSession(sessionId: string): Promise<void> {
  return invoke("kill_session", { sessionId });
}

export async function getSessions(
  workspaceId: string,
): Promise<SessionInfo[]> {
  return invoke("get_sessions", { workspaceId });
}

export async function updateSessionStatus(
  sessionId: string,
  status: string,
): Promise<void> {
  return invoke("update_session_status", { sessionId, status });
}

// Workspace commands
export async function createWorkspace(name: string): Promise<WorkspaceInfo> {
  return invoke("create_workspace", { name });
}

export async function getWorkspaces(): Promise<WorkspaceInfo[]> {
  return invoke("get_workspaces");
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  return invoke("delete_workspace", { workspaceId });
}

export async function setActiveWorkspace(workspaceId: string): Promise<void> {
  return invoke("set_active_workspace", { workspaceId });
}

export async function saveLayout(
  workspaceId: string,
  layoutJson: string,
): Promise<void> {
  return invoke("save_layout", { workspaceId, layoutJson });
}

export async function renameWorkspace(
  workspaceId: string,
  name: string,
): Promise<void> {
  return invoke("rename_workspace", { workspaceId, name });
}

export async function setWorkspaceRepo(
  workspaceId: string,
  repoPath: string | null,
): Promise<void> {
  return invoke("set_workspace_repo", { workspaceId, repoPath });
}

export async function createWorkspaceWithRepo(
  name: string,
  repoPath: string | null,
): Promise<WorkspaceInfo> {
  return invoke("create_workspace_with_repo", { name, repoPath });
}

// CLAUDE.md management
export async function readClaudeMd(projectDir: string): Promise<string | null> {
  return invoke("read_claude_md", { projectDir });
}

export async function writeClaudeMd(projectDir: string, content: string): Promise<void> {
  return invoke("write_claude_md", { projectDir, content });
}

// Additional git commands
export async function gitFetch(workingDir: string): Promise<string> {
  return invoke("git_fetch", { workingDir });
}

export async function gitStash(workingDir: string, pop: boolean = false): Promise<string> {
  return invoke("git_stash", { workingDir, pop });
}

export async function gitDiffStat(workingDir: string): Promise<string> {
  return invoke("git_diff_stat", { workingDir });
}

// Utility commands
export async function getGitBranch(
  workingDir: string,
): Promise<string | null> {
  return invoke("get_git_branch", { workingDir });
}

export async function isGitRepo(workingDir: string): Promise<boolean> {
  return invoke("is_git_repo", { workingDir });
}

export async function getClaudePath(): Promise<string> {
  return invoke("get_claude_path");
}

export async function getSetting(key: string): Promise<string | null> {
  return invoke("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke("set_setting", { key, value });
}

export async function getDefaultShell(): Promise<string> {
  return invoke("get_default_shell");
}

export async function spawnShellSession(
  workingDir: string,
  workspaceId: string,
): Promise<SessionInfo> {
  return invoke("spawn_shell_session", { workingDir, workspaceId });
}

// === New: Hub, Skills, Models, Utility Commands ===

export interface SkillInfo {
  name: string;
  description: string;
  category: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  speed: string;
  tier: string;
}

export async function cloneRepo(
  url: string,
  targetDir?: string,
): Promise<string> {
  return invoke("clone_repo", { url, targetDir });
}

export async function getHomeDir(): Promise<string> {
  return invoke("get_home_dir");
}

export async function listRecentDirs(): Promise<string[]> {
  return invoke("list_recent_dirs");
}

export async function detectClaudeSkills(): Promise<SkillInfo[]> {
  return invoke("detect_claude_skills");
}

export async function getAvailableModels(): Promise<ModelInfo[]> {
  return invoke("get_available_models");
}

export async function sendToSession(
  sessionId: string,
  text: string,
): Promise<void> {
  return invoke("send_to_session", { sessionId, text });
}

export async function dirExists(path: string): Promise<boolean> {
  return invoke("dir_exists", { path });
}

// === Git Manager Commands ===

export interface GitStatusInfo {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  has_remote: boolean;
  remote_url: string;
}

export interface GitFileChange {
  path: string;
  status: string;
}

export interface GitLogEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitBranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  last_commit: string;
}

export async function gitStatus(workingDir: string): Promise<GitStatusInfo> {
  return invoke("git_status", { workingDir });
}

export async function gitPush(workingDir: string, setUpstream: boolean = false): Promise<string> {
  return invoke("git_push", { workingDir, setUpstream });
}

export async function gitPull(workingDir: string): Promise<string> {
  return invoke("git_pull", { workingDir });
}

export async function gitCommit(workingDir: string, message: string, stageAll: boolean = false): Promise<string> {
  return invoke("git_commit", { workingDir, message, stageAll });
}

export async function gitStageFile(workingDir: string, filePath: string): Promise<void> {
  return invoke("git_stage_file", { workingDir, filePath });
}

export async function gitUnstageFile(workingDir: string, filePath: string): Promise<void> {
  return invoke("git_unstage_file", { workingDir, filePath });
}

export async function gitCreateBranch(workingDir: string, branchName: string, checkout: boolean = true): Promise<void> {
  return invoke("git_create_branch", { workingDir, branchName, checkout });
}

export async function gitSwitchBranch(workingDir: string, branchName: string): Promise<void> {
  return invoke("git_switch_branch", { workingDir, branchName });
}

export async function gitListBranches(workingDir: string): Promise<GitBranchInfo[]> {
  return invoke("git_list_branches", { workingDir });
}

export async function gitLog(workingDir: string, count: number = 20): Promise<GitLogEntry[]> {
  return invoke("git_log", { workingDir, count });
}

export async function gitDiscardFile(workingDir: string, filePath: string): Promise<void> {
  return invoke("git_discard_file", { workingDir, filePath });
}

// === MCP Manager Commands ===

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  scope: string;
  source_file: string;
}

export interface McpServerEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
  disabled?: boolean;
}

export async function listMcps(projectDir?: string): Promise<McpServerConfig[]> {
  return invoke("list_mcps", { projectDir: projectDir ?? null });
}

export async function saveMcpConfig(configPath: string, servers: Record<string, McpServerEntry>): Promise<void> {
  return invoke("save_mcp_config", { configPath, servers });
}

export async function toggleMcpServer(configPath: string, serverName: string, enabled: boolean): Promise<void> {
  return invoke("toggle_mcp_server", { configPath, serverName, enabled });
}

export async function removeMcpServer(configPath: string, serverName: string): Promise<void> {
  return invoke("remove_mcp_server", { configPath, serverName });
}

export async function addMcpServer(
  configPath: string, name: string, command: string,
  args: string[], env: Record<string, string>,
): Promise<void> {
  return invoke("add_mcp_server", { configPath, name, command, args, env });
}

// Event listeners
export function onPtyOutput(
  callback: (data: PtyOutput) => void,
): Promise<UnlistenFn> {
  return listen<PtyOutput>("pty-output", (event) => {
    callback(event.payload);
  });
}

export function onSessionEnded(
  callback: (data: { session_id: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ session_id: string }>("session-ended", (event) => {
    callback(event.payload);
  });
}
