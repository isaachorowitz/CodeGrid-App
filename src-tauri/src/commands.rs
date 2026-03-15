use crate::db::Database;
use crate::pty_manager::PtyManager;
use crate::session::{Session, SessionStatus};
use crate::workspace::Workspace;
use crate::worktree::WorktreeManager;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex as TokioMutex;
use uuid::Uuid;

pub struct AppState {
    pub pty_manager: PtyManager,
    pub db: Database,
    pub sessions: TokioMutex<Vec<Session>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionInfo {
    pub id: String,
    pub workspace_id: String,
    pub working_dir: String,
    pub command: String,
    pub git_branch: Option<String>,
    pub status: String,
    pub created_at: String,
    pub pane_number: u32,
    pub worktree_path: Option<String>,
}

impl From<&Session> for SessionInfo {
    fn from(s: &Session) -> Self {
        Self {
            id: s.id.clone(),
            workspace_id: s.workspace_id.clone(),
            working_dir: s.working_dir.clone(),
            command: s.command.clone(),
            git_branch: s.git_branch.clone(),
            status: match &s.status {
                SessionStatus::Idle => "idle".to_string(),
                SessionStatus::Running => "running".to_string(),
                SessionStatus::Waiting => "waiting".to_string(),
                SessionStatus::Error => "error".to_string(),
                SessionStatus::Dead => "dead".to_string(),
            },
            created_at: s.created_at.clone(),
            pane_number: s.pane_number,
            worktree_path: s.worktree_path.clone(),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct PtyOutput {
    pub session_id: String,
    pub data: Vec<u8>,
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with("~") {
        if let Ok(home) = std::env::var("HOME") {
            return path.replacen("~", &home, 1);
        }
    }
    path.to_string()
}

// === Session Commands ===

#[tauri::command]
pub async fn create_session(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    working_dir: String,
    workspace_id: String,
    use_worktree: bool,
    resume: bool,
) -> Result<SessionInfo, String> {
    let working_dir = expand_tilde(&working_dir);
    let session_id = Uuid::new_v4().to_string();
    let sessions = state.sessions.lock().await;
    let pane_number = sessions.len() as u32 + 1;
    drop(sessions);

    // Determine actual working directory (possibly a worktree)
    let (actual_dir, worktree_path, git_branch) = if use_worktree
        && WorktreeManager::is_git_repo(&working_dir)
    {
        // Check if another session is already working in this repo
        let sessions = state.sessions.lock().await;
        let repo_root = WorktreeManager::git_root(&working_dir);
        let needs_worktree = repo_root.as_ref().map_or(false, |root| {
            sessions.iter().any(|s| {
                let s_root = WorktreeManager::git_root(&s.working_dir);
                s_root.as_ref() == Some(root)
            })
        });
        drop(sessions);

        if needs_worktree {
            let (wt_path, branch) =
                WorktreeManager::create_worktree(&working_dir, &session_id)?;
            (wt_path.clone(), Some(wt_path), Some(branch))
        } else {
            let branch = WorktreeManager::current_branch(&working_dir);
            (working_dir.clone(), None, branch)
        }
    } else {
        let branch = if WorktreeManager::is_git_repo(&working_dir) {
            WorktreeManager::current_branch(&working_dir)
        } else {
            None
        };
        (working_dir.clone(), None, branch)
    };

    // Detect claude binary
    let claude_path = which::which("claude")
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "claude".to_string());

    let mut args: Vec<String> = Vec::new();
    if resume {
        args.push("--resume".to_string());
    }

    // Spawn PTY
    let mut rx = state.pty_manager.spawn_session(
        &session_id,
        &actual_dir,
        &claude_path,
        &args,
        120,
        30,
    )?;

    // Create session object
    let mut session = Session::new(
        session_id.clone(),
        workspace_id,
        actual_dir,
        claude_path,
        pane_number,
    );
    session.git_branch = git_branch;
    session.worktree_path = worktree_path;
    session.status = SessionStatus::Running;

    // Save to DB
    let _ = state.db.save_session(&session);

    // Store in memory
    let info = SessionInfo::from(&session);
    state.sessions.lock().await.push(session);

    // Spawn output reader task
    let app_handle = app.clone();
    let sid = session_id.clone();
    tokio::spawn(async move {
        while let Some(data) = rx.recv().await {
            let _ = app_handle.emit(
                "pty-output",
                PtyOutput {
                    session_id: sid.clone(),
                    data,
                },
            );
        }
        // Session ended
        let _ = app_handle.emit(
            "session-ended",
            serde_json::json!({ "session_id": sid }),
        );
    });

    Ok(info)
}

#[tauri::command]
pub async fn write_to_pty(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    state.pty_manager.write_to_pty(&session_id, &data)
}

#[tauri::command]
pub async fn resize_pty(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.pty_manager.resize_pty(&session_id, cols, rows)
}

#[tauri::command]
pub async fn kill_session(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), String> {
    state.pty_manager.kill_session(&session_id)?;

    let mut sessions = state.sessions.lock().await;
    if let Some(pos) = sessions.iter().position(|s| s.id == session_id) {
        let session = sessions.remove(pos);
        let _ = state.db.delete_session(&session_id);

        // Clean up worktree if applicable
        if let Some(wt_path) = &session.worktree_path {
            if let Some(root) = WorktreeManager::git_root(&session.working_dir) {
                let _ = WorktreeManager::remove_worktree(&root, wt_path);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_sessions(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Vec<SessionInfo>, String> {
    let sessions = state.sessions.lock().await;
    Ok(sessions
        .iter()
        .filter(|s| s.workspace_id == workspace_id)
        .map(SessionInfo::from)
        .collect())
}

#[tauri::command]
pub async fn update_session_status(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    status: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(session) = sessions.iter_mut().find(|s| s.id == session_id) {
        session.status = match status.as_str() {
            "idle" => SessionStatus::Idle,
            "running" => SessionStatus::Running,
            "waiting" => SessionStatus::Waiting,
            "error" => SessionStatus::Error,
            "dead" => SessionStatus::Dead,
            _ => return Err(format!("Invalid status: {}", status)),
        };
        let _ = state.db.save_session(session);
    }
    Ok(())
}

// === Workspace Commands ===

#[tauri::command]
pub async fn create_workspace(
    state: State<'_, Arc<AppState>>,
    name: String,
) -> Result<Workspace, String> {
    let id = Uuid::new_v4().to_string();
    let workspace = Workspace::new(id, name);
    state.db.save_workspace(&workspace)?;
    Ok(workspace)
}

#[tauri::command]
pub async fn get_workspaces(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Workspace>, String> {
    state.db.load_workspaces()
}

#[tauri::command]
pub async fn delete_workspace(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<(), String> {
    // Kill all sessions in the workspace
    let sessions = state.sessions.lock().await;
    let session_ids: Vec<String> = sessions
        .iter()
        .filter(|s| s.workspace_id == workspace_id)
        .map(|s| s.id.clone())
        .collect();
    drop(sessions);

    for sid in session_ids {
        let _ = state.pty_manager.kill_session(&sid);
    }

    state.sessions.lock().await.retain(|s| s.workspace_id != workspace_id);
    state.db.delete_workspace(&workspace_id)
}

#[tauri::command]
pub async fn set_active_workspace(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<(), String> {
    state.db.set_active_workspace(&workspace_id)
}

#[tauri::command]
pub async fn save_layout(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    layout_json: String,
) -> Result<(), String> {
    state.db.save_layout(&workspace_id, &layout_json)
}

#[tauri::command]
pub async fn rename_workspace(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    name: String,
) -> Result<(), String> {
    let workspaces = state.db.load_workspaces()?;
    if let Some(mut ws) = workspaces.into_iter().find(|w| w.id == workspace_id) {
        ws.name = name;
        state.db.save_workspace(&ws)?;
    }
    Ok(())
}

// === Utility Commands ===

#[tauri::command]
pub async fn get_git_branch(working_dir: String) -> Result<Option<String>, String> {
    Ok(WorktreeManager::current_branch(&working_dir))
}

#[tauri::command]
pub async fn is_git_repo(working_dir: String) -> Result<bool, String> {
    Ok(WorktreeManager::is_git_repo(&working_dir))
}

#[tauri::command]
pub async fn get_claude_path() -> Result<String, String> {
    which::which("claude")
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|_| "Claude Code not found. Install it with: npm install -g @anthropic-ai/claude-code".to_string())
}

#[tauri::command]
pub async fn get_setting(
    state: State<'_, Arc<AppState>>,
    key: String,
) -> Result<Option<String>, String> {
    Ok(state.db.get_setting(&key))
}

#[tauri::command]
pub async fn set_setting(
    state: State<'_, Arc<AppState>>,
    key: String,
    value: String,
) -> Result<(), String> {
    state.db.set_setting(&key, &value)
}

#[tauri::command]
pub async fn get_default_shell() -> Result<String, String> {
    #[cfg(unix)]
    {
        Ok(std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string()))
    }
    #[cfg(windows)]
    {
        Ok("powershell.exe".to_string())
    }
}

#[tauri::command]
pub async fn spawn_shell_session(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    working_dir: String,
    workspace_id: String,
) -> Result<SessionInfo, String> {
    let working_dir = expand_tilde(&working_dir);
    let session_id = Uuid::new_v4().to_string();
    let sessions = state.sessions.lock().await;
    let pane_number = sessions.len() as u32 + 1;
    drop(sessions);

    let shell = get_default_shell().await?;
    let git_branch = if WorktreeManager::is_git_repo(&working_dir) {
        WorktreeManager::current_branch(&working_dir)
    } else {
        None
    };

    let mut rx = state.pty_manager.spawn_session(
        &session_id,
        &working_dir,
        &shell,
        &[],
        120,
        30,
    )?;

    let mut session = Session::new(
        session_id.clone(),
        workspace_id,
        working_dir,
        shell,
        pane_number,
    );
    session.git_branch = git_branch;
    session.status = SessionStatus::Running;

    let _ = state.db.save_session(&session);
    let info = SessionInfo::from(&session);
    state.sessions.lock().await.push(session);

    let app_handle = app.clone();
    let sid = session_id.clone();
    tokio::spawn(async move {
        while let Some(data) = rx.recv().await {
            let _ = app_handle.emit(
                "pty-output",
                PtyOutput {
                    session_id: sid.clone(),
                    data,
                },
            );
        }
        let _ = app_handle.emit(
            "session-ended",
            serde_json::json!({ "session_id": sid }),
        );
    });

    Ok(info)
}
