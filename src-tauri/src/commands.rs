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

// === Git Clone Commands ===

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CloneProgress {
    pub status: String,
    pub path: String,
}

#[tauri::command]
pub async fn clone_repo(
    app: AppHandle,
    url: String,
    target_dir: Option<String>,
) -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let projects_dir = target_dir.unwrap_or_else(|| format!("{}/Projects", home));

    // Create Projects dir if needed
    std::fs::create_dir_all(&projects_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Extract repo name from URL
    let repo_name = url
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .rsplit('/')
        .next()
        .unwrap_or("repo")
        .to_string();

    let clone_path = format!("{}/{}", projects_dir, repo_name);

    // Check if already exists
    if std::path::Path::new(&clone_path).exists() {
        return Ok(clone_path);
    }

    let _ = app.emit("clone-progress", serde_json::json!({
        "status": "cloning",
        "repo": &repo_name,
    }));

    let output = std::process::Command::new("git")
        .args(["clone", &url, &clone_path])
        .output()
        .map_err(|e| format!("Failed to run git clone: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Clone failed: {}", stderr));
    }

    let _ = app.emit("clone-progress", serde_json::json!({
        "status": "done",
        "repo": &repo_name,
        "path": &clone_path,
    }));

    Ok(clone_path)
}

#[tauri::command]
pub async fn get_home_dir() -> Result<String, String> {
    std::env::var("HOME").map_err(|_| "Could not determine home directory".to_string())
}

#[tauri::command]
pub async fn list_recent_dirs() -> Result<Vec<String>, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let mut dirs: Vec<String> = Vec::new();

    // Check common project locations
    let search_paths = [
        format!("{}/Projects", home),
        format!("{}/projects", home),
        format!("{}/Developer", home),
        format!("{}/dev", home),
        format!("{}/Code", home),
        format!("{}/code", home),
        format!("{}/repos", home),
        format!("{}/src", home),
        format!("{}/workspace", home),
        format!("{}/Documents/GitHub", home),
        format!("{}/GitHub", home),
        home.clone(),
    ];

    for base in &search_paths {
        if let Ok(entries) = std::fs::read_dir(base) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let git_dir = path.join(".git");
                    let pkg_json = path.join("package.json");
                    let cargo_toml = path.join("Cargo.toml");
                    let pyproject = path.join("pyproject.toml");
                    if git_dir.exists() || pkg_json.exists() || cargo_toml.exists() || pyproject.exists() {
                        if let Some(s) = path.to_str() {
                            if !dirs.contains(&s.to_string()) {
                                dirs.push(s.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by modification time (newest first)
    dirs.sort_by(|a, b| {
        let a_time = std::fs::metadata(a).and_then(|m| m.modified()).ok();
        let b_time = std::fs::metadata(b).and_then(|m| m.modified()).ok();
        b_time.cmp(&a_time)
    });

    dirs.truncate(30);
    Ok(dirs)
}

// === Claude Code Integration Commands ===

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub category: String,
}

#[tauri::command]
pub async fn detect_claude_skills() -> Result<Vec<SkillInfo>, String> {
    let mut skills = vec![
        SkillInfo { name: "/help".to_string(), description: "Get help with Claude Code".to_string(), category: "General".to_string() },
        SkillInfo { name: "/clear".to_string(), description: "Clear conversation history".to_string(), category: "General".to_string() },
        SkillInfo { name: "/compact".to_string(), description: "Compact conversation to save context".to_string(), category: "General".to_string() },
        SkillInfo { name: "/cost".to_string(), description: "Show token usage and costs".to_string(), category: "General".to_string() },
        SkillInfo { name: "/doctor".to_string(), description: "Check Claude Code health and config".to_string(), category: "General".to_string() },
        SkillInfo { name: "/init".to_string(), description: "Initialize CLAUDE.md project file".to_string(), category: "Project".to_string() },
        SkillInfo { name: "/review".to_string(), description: "Review code changes".to_string(), category: "Coding".to_string() },
        SkillInfo { name: "/bug".to_string(), description: "Report or investigate a bug".to_string(), category: "Coding".to_string() },
        SkillInfo { name: "/config".to_string(), description: "Open or edit configuration".to_string(), category: "General".to_string() },
        SkillInfo { name: "/login".to_string(), description: "Log in to Anthropic".to_string(), category: "General".to_string() },
        SkillInfo { name: "/logout".to_string(), description: "Log out of current account".to_string(), category: "General".to_string() },
        SkillInfo { name: "/model".to_string(), description: "Switch or display current model".to_string(), category: "Models".to_string() },
        SkillInfo { name: "/permissions".to_string(), description: "View or modify tool permissions".to_string(), category: "General".to_string() },
        SkillInfo { name: "/status".to_string(), description: "Show session status and info".to_string(), category: "General".to_string() },
        SkillInfo { name: "/vim".to_string(), description: "Toggle vim keybindings".to_string(), category: "General".to_string() },
        SkillInfo { name: "/memory".to_string(), description: "Save info to project memory".to_string(), category: "Project".to_string() },
        SkillInfo { name: "/terminal-setup".to_string(), description: "Configure terminal integration".to_string(), category: "General".to_string() },
        SkillInfo { name: "/pr-comments".to_string(), description: "Address PR review comments".to_string(), category: "Coding".to_string() },
        SkillInfo { name: "/mcp".to_string(), description: "Manage MCP server connections".to_string(), category: "General".to_string() },
    ];

    // Detect custom skills
    let home = std::env::var("HOME").unwrap_or_default();
    let config_path = format!("{}/.claude/skills", home);
    if let Ok(entries) = std::fs::read_dir(&config_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "md" || e == "txt") {
                let name = path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                skills.push(SkillInfo {
                    name: format!("/{}", name),
                    description: "Custom skill".to_string(),
                    category: "Custom".to_string(),
                });
            }
        }
    }

    Ok(skills)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub speed: String,
    pub tier: String,
}

#[tauri::command]
pub async fn get_available_models() -> Result<Vec<ModelInfo>, String> {
    Ok(vec![
        ModelInfo {
            id: "claude-opus-4-6".to_string(),
            name: "Opus 4.6".to_string(),
            description: "Most capable. Best for complex reasoning and architecture.".to_string(),
            speed: "Slower".to_string(),
            tier: "max".to_string(),
        },
        ModelInfo {
            id: "claude-sonnet-4-6".to_string(),
            name: "Sonnet 4.6".to_string(),
            description: "Fast and capable. Great balance of speed and quality.".to_string(),
            speed: "Fast".to_string(),
            tier: "high".to_string(),
        },
        ModelInfo {
            id: "claude-haiku-4-5".to_string(),
            name: "Haiku 4.5".to_string(),
            description: "Fastest and cheapest. Good for simple tasks.".to_string(),
            speed: "Fastest".to_string(),
            tier: "standard".to_string(),
        },
    ])
}

#[tauri::command]
pub async fn send_to_session(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    text: String,
) -> Result<(), String> {
    let data = format!("{}\n", text);
    state.pty_manager.write_to_pty(&session_id, data.as_bytes())
}

#[tauri::command]
pub async fn dir_exists(path: String) -> Result<bool, String> {
    let expanded = expand_tilde(&path);
    Ok(std::path::Path::new(&expanded).is_dir())
}
