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

#[tauri::command]
pub async fn set_workspace_repo(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    repo_path: Option<String>,
) -> Result<(), String> {
    let workspaces = state.db.load_workspaces()?;
    if let Some(mut ws) = workspaces.into_iter().find(|w| w.id == workspace_id) {
        ws.repo_path = repo_path;
        state.db.save_workspace(&ws)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn create_workspace_with_repo(
    state: State<'_, Arc<AppState>>,
    name: String,
    repo_path: Option<String>,
) -> Result<Workspace, String> {
    let id = Uuid::new_v4().to_string();
    let mut workspace = Workspace::new(id, name);
    if let Some(ref path) = repo_path {
        workspace = workspace.with_repo(path.clone());
    }
    state.db.save_workspace(&workspace)?;
    Ok(workspace)
}

// === CLAUDE.md Management ===

#[tauri::command]
pub async fn read_claude_md(project_dir: String) -> Result<Option<String>, String> {
    let dir = validate_dir(&project_dir)?;
    let path = format!("{}/CLAUDE.md", dir);
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(Some(content)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn write_claude_md(project_dir: String, content: String) -> Result<(), String> {
    let dir = validate_dir(&project_dir)?;
    let path = format!("{}/CLAUDE.md", dir);
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))
}

// === Git Fetch ===

#[tauri::command]
pub async fn git_fetch(working_dir: String) -> Result<String, String> {
    let dir = validate_dir(&working_dir)?;
    run_git(&dir, &["fetch", "--all", "--prune"])
}

// === Git Stash ===

#[tauri::command]
pub async fn git_stash(working_dir: String, pop: bool) -> Result<String, String> {
    let dir = validate_dir(&working_dir)?;
    if pop {
        run_git(&dir, &["stash", "pop"])
    } else {
        run_git(&dir, &["stash"])
    }
}

// === Git Diff ===

#[tauri::command]
pub async fn git_diff_stat(working_dir: String) -> Result<String, String> {
    let dir = validate_dir(&working_dir)?;
    run_git(&dir, &["diff", "--stat"])
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
    // Validate URL - must look like a git URL
    if !url.starts_with("https://") && !url.starts_with("http://") && !url.starts_with("git@") && !url.starts_with("ssh://") {
        return Err("Invalid URL: must start with https://, http://, git@, or ssh://".to_string());
    }

    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let projects_dir = target_dir.unwrap_or_else(|| format!("{}/Projects", home));

    // Validate projects_dir is under home or /tmp
    let projects_path = std::path::Path::new(&projects_dir);
    if !projects_dir.starts_with(&home) && !projects_dir.starts_with("/tmp") {
        return Err("Target directory must be under your home directory".to_string());
    }

    // Create Projects dir if needed
    std::fs::create_dir_all(&projects_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Extract repo name from URL and sanitize
    let repo_name = url
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .rsplit('/')
        .next()
        .unwrap_or("repo")
        .to_string();

    // Reject repo names with path traversal
    if repo_name.contains("..") || repo_name.contains('/') || repo_name.contains('\\') || repo_name.is_empty() {
        return Err("Invalid repository name extracted from URL".to_string());
    }

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

// === Git Manager Commands ===

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitStatusInfo {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub staged: Vec<GitFileChange>,
    pub unstaged: Vec<GitFileChange>,
    pub untracked: Vec<String>,
    pub has_remote: bool,
    pub remote_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitFileChange {
    pub path: String,
    pub status: String, // "modified", "added", "deleted", "renamed"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitBranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub last_commit: String,
}

fn validate_dir(dir: &str) -> Result<String, String> {
    let expanded = expand_tilde(dir);
    let path = std::path::Path::new(&expanded);
    if !path.is_dir() {
        return Err(format!("Directory does not exist: {}", expanded));
    }
    // Canonicalize to prevent path traversal
    let canonical = path.canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    canonical.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Path contains invalid characters".to_string())
}

fn validate_file_path(file_path: &str) -> Result<(), String> {
    // Reject path traversal attempts
    if file_path.contains("..") || file_path.starts_with('/') || file_path.starts_with('\\') {
        return Err("Invalid file path: path traversal not allowed".to_string());
    }
    Ok(())
}

fn run_git(dir: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(stderr.trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub async fn git_status(working_dir: String) -> Result<GitStatusInfo, String> {
    let dir = validate_dir(&working_dir)?;

    let branch = run_git(&dir, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();

    // Ahead/behind
    let (ahead, behind) = {
        let ab = run_git(&dir, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]).unwrap_or_default();
        let parts: Vec<&str> = ab.split_whitespace().collect();
        (
            parts.first().and_then(|s| s.parse().ok()).unwrap_or(0u32),
            parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0u32),
        )
    };

    // Porcelain status
    let status_out = run_git(&dir, &["status", "--porcelain=v1"])?;
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for line in status_out.lines() {
        if line.len() < 3 { continue; }
        let index = line.chars().nth(0).unwrap_or(' ');
        let work = line.chars().nth(1).unwrap_or(' ');
        let path = line[3..].to_string();

        if index == '?' {
            untracked.push(path);
            continue;
        }
        if index != ' ' && index != '?' {
            staged.push(GitFileChange {
                path: path.clone(),
                status: match index {
                    'M' => "modified", 'A' => "added", 'D' => "deleted", 'R' => "renamed", _ => "modified",
                }.to_string(),
            });
        }
        if work != ' ' && work != '?' {
            unstaged.push(GitFileChange {
                path,
                status: match work {
                    'M' => "modified", 'D' => "deleted", _ => "modified",
                }.to_string(),
            });
        }
    }

    // Remote URL
    let remote_url = run_git(&dir, &["remote", "get-url", "origin"]).unwrap_or_default();
    let has_remote = !remote_url.is_empty();

    Ok(GitStatusInfo { branch, ahead, behind, staged, unstaged, untracked, has_remote, remote_url })
}

#[tauri::command]
pub async fn git_push(working_dir: String, set_upstream: bool) -> Result<String, String> {
    let dir = validate_dir(&working_dir)?;
    if set_upstream {
        let branch = run_git(&dir, &["rev-parse", "--abbrev-ref", "HEAD"])?;
        run_git(&dir, &["push", "-u", "origin", &branch])
    } else {
        run_git(&dir, &["push"])
    }
}

#[tauri::command]
pub async fn git_pull(working_dir: String) -> Result<String, String> {
    let dir = validate_dir(&working_dir)?;
    run_git(&dir, &["pull"])
}

#[tauri::command]
pub async fn git_commit(working_dir: String, message: String, stage_all: bool) -> Result<String, String> {
    let dir = validate_dir(&working_dir)?;
    if stage_all {
        run_git(&dir, &["add", "-A"])?;
    }
    run_git(&dir, &["commit", "-m", &message])
}

#[tauri::command]
pub async fn git_stage_file(working_dir: String, file_path: String) -> Result<(), String> {
    let dir = validate_dir(&working_dir)?;
    validate_file_path(&file_path)?;
    run_git(&dir, &["add", &file_path])?;
    Ok(())
}

#[tauri::command]
pub async fn git_unstage_file(working_dir: String, file_path: String) -> Result<(), String> {
    let dir = validate_dir(&working_dir)?;
    validate_file_path(&file_path)?;
    run_git(&dir, &["reset", "HEAD", &file_path])?;
    Ok(())
}

#[tauri::command]
pub async fn git_create_branch(working_dir: String, branch_name: String, checkout: bool) -> Result<(), String> {
    let dir = validate_dir(&working_dir)?;
    // Validate branch name - reject shell metacharacters
    if branch_name.contains(|c: char| " \t\n\r$`|;&<>(){}".contains(c)) {
        return Err("Invalid branch name: contains special characters".to_string());
    }
    if checkout {
        run_git(&dir, &["checkout", "-b", &branch_name])?;
    } else {
        run_git(&dir, &["branch", &branch_name])?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_switch_branch(working_dir: String, branch_name: String) -> Result<(), String> {
    let dir = validate_dir(&working_dir)?;
    run_git(&dir, &["checkout", &branch_name])?;
    Ok(())
}

#[tauri::command]
pub async fn git_list_branches(working_dir: String) -> Result<Vec<GitBranchInfo>, String> {
    let dir = validate_dir(&working_dir)?;

    let current = run_git(&dir, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();

    // Local branches
    let local_out = run_git(&dir, &["branch", "--format=%(refname:short)\t%(objectname:short)\t%(subject)"])?;
    let mut branches: Vec<GitBranchInfo> = local_out
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(3, '\t').collect();
            GitBranchInfo {
                name: parts.first().unwrap_or(&"").to_string(),
                is_current: parts.first().unwrap_or(&"") == &current,
                is_remote: false,
                last_commit: parts.get(2).unwrap_or(&"").to_string(),
            }
        })
        .collect();

    // Remote branches
    let remote_out = run_git(&dir, &["branch", "-r", "--format=%(refname:short)\t%(objectname:short)\t%(subject)"]).unwrap_or_default();
    for line in remote_out.lines() {
        if line.is_empty() || line.contains("HEAD") { continue; }
        let parts: Vec<&str> = line.splitn(3, '\t').collect();
        let name = parts.first().unwrap_or(&"").to_string();
        // Skip if local exists
        if branches.iter().any(|b| name.ends_with(&b.name)) { continue; }
        branches.push(GitBranchInfo {
            name,
            is_current: false,
            is_remote: true,
            last_commit: parts.get(2).unwrap_or(&"").to_string(),
        });
    }

    Ok(branches)
}

#[tauri::command]
pub async fn git_log(working_dir: String, count: u32) -> Result<Vec<GitLogEntry>, String> {
    let dir = validate_dir(&working_dir)?;
    let n = format!("-{}", count.min(50));
    let out = run_git(&dir, &["log", &n, "--format=%H\t%h\t%s\t%an\t%cr"])?;

    Ok(out
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(5, '\t').collect();
            GitLogEntry {
                hash: parts.first().unwrap_or(&"").to_string(),
                short_hash: parts.get(1).unwrap_or(&"").to_string(),
                message: parts.get(2).unwrap_or(&"").to_string(),
                author: parts.get(3).unwrap_or(&"").to_string(),
                date: parts.get(4).unwrap_or(&"").to_string(),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn git_discard_file(working_dir: String, file_path: String) -> Result<(), String> {
    let dir = validate_dir(&working_dir)?;
    validate_file_path(&file_path)?;
    run_git(&dir, &["checkout", "--", &file_path])?;
    Ok(())
}

// === MCP Manager Commands ===

fn validate_mcp_config_path(config_path: &str) -> Result<(), String> {
    let home = std::env::var("HOME").unwrap_or_default();
    // Config path must be under home dir and end with .json
    if !config_path.starts_with(&home) {
        return Err("MCP config path must be under home directory".to_string());
    }
    if !config_path.ends_with(".json") {
        return Err("MCP config path must be a .json file".to_string());
    }
    if config_path.contains("..") {
        return Err("MCP config path must not contain path traversal".to_string());
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpServerConfig {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: std::collections::HashMap<String, String>,
    pub enabled: bool,
    pub scope: String, // "global", "project"
    pub source_file: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpConfigFile {
    #[serde(rename = "mcpServers", default)]
    pub mcp_servers: std::collections::HashMap<String, McpServerEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpServerEntry {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub disabled: Option<bool>,
}

fn read_mcp_file(path: &str) -> Option<McpConfigFile> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

#[tauri::command]
pub async fn list_mcps(project_dir: Option<String>) -> Result<Vec<McpServerConfig>, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let mut servers: Vec<McpServerConfig> = Vec::new();

    // 1. Global MCPs: ~/.claude/mcp.json or ~/.claude.json
    let global_paths = [
        format!("{}/.claude/mcp.json", home),
        format!("{}/.claude.json", home),
    ];

    for gpath in &global_paths {
        if let Some(config) = read_mcp_file(gpath) {
            for (name, entry) in &config.mcp_servers {
                servers.push(McpServerConfig {
                    name: name.clone(),
                    command: entry.command.clone(),
                    args: entry.args.clone(),
                    env: entry.env.clone(),
                    enabled: !entry.disabled.unwrap_or(false),
                    scope: "global".to_string(),
                    source_file: gpath.clone(),
                });
            }
        }
    }

    // 2. Project MCPs: <project>/.claude/mcp.json or <project>/.mcp.json
    if let Some(ref pdir) = project_dir {
        let dir = expand_tilde(pdir);
        let project_paths = [
            format!("{}/.claude/mcp.json", dir),
            format!("{}/.mcp.json", dir),
        ];

        for ppath in &project_paths {
            if let Some(config) = read_mcp_file(ppath) {
                for (name, entry) in &config.mcp_servers {
                    // Check if already in list (project overrides global)
                    servers.retain(|s| !(s.name == *name && s.scope == "global"));
                    servers.push(McpServerConfig {
                        name: name.clone(),
                        command: entry.command.clone(),
                        args: entry.args.clone(),
                        env: entry.env.clone(),
                        enabled: !entry.disabled.unwrap_or(false),
                        scope: "project".to_string(),
                        source_file: ppath.clone(),
                    });
                }
            }
        }
    }

    Ok(servers)
}

#[tauri::command]
pub async fn save_mcp_config(
    config_path: String,
    servers: std::collections::HashMap<String, McpServerEntry>,
) -> Result<(), String> {
    validate_mcp_config_path(&config_path)?;
    let config = McpConfigFile { mcp_servers: servers };
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    // Ensure parent directory exists
    let path = std::path::Path::new(&config_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    std::fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_mcp_server(
    config_path: String,
    server_name: String,
    enabled: bool,
) -> Result<(), String> {
    validate_mcp_config_path(&config_path)?;
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    let mut config: McpConfigFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    if let Some(server) = config.mcp_servers.get_mut(&server_name) {
        server.disabled = Some(!enabled);
    }

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn remove_mcp_server(
    config_path: String,
    server_name: String,
) -> Result<(), String> {
    validate_mcp_config_path(&config_path)?;
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    let mut config: McpConfigFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    config.mcp_servers.remove(&server_name);

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn add_mcp_server(
    config_path: String,
    name: String,
    command: String,
    args: Vec<String>,
    env: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    validate_mcp_config_path(&config_path)?;

    // Validate command doesn't contain path traversal or shell tricks
    if command.contains("..") || command.contains(';') || command.contains('|') || command.contains('&') {
        return Err("Invalid command: contains prohibited characters".to_string());
    }

    let mut config = read_mcp_file(&config_path).unwrap_or(McpConfigFile {
        mcp_servers: std::collections::HashMap::new(),
    });

    config.mcp_servers.insert(name, McpServerEntry {
        command,
        args,
        env,
        disabled: Some(false),
    });

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    let path = std::path::Path::new(&config_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    std::fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}
