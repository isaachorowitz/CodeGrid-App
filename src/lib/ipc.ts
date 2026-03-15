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
