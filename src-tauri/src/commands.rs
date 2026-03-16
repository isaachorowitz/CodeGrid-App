use crate::db::Database;
use crate::pty_manager::PtyManager;
use crate::session::{Session, SessionStatus};
use crate::workspace::Workspace;
use crate::worktree::WorktreeManager;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex as TokioMutex;
use uuid::Uuid;

pub struct AppState {
    pub pty_manager: PtyManager,
    pub db: Database,
    pub sessions: TokioMutex<Vec<Session>>,
    pub connect_signals: TokioMutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<()>>>,
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
    let pane_number = sessions.iter().filter(|s| s.workspace_id == workspace_id).count() as u32 + 1;
    drop(sessions);

    // Determine actual working directory (possibly a worktree)
    let (actual_dir, worktree_path, git_branch) = if use_worktree
        && WorktreeManager::is_git_repo(&working_dir)
    {
        // Check if another session is already working in this repo
        let sessions = state.sessions.lock().await;
        let repo_root = WorktreeManager::git_root(&working_dir);
        let needs_worktree = repo_root.as_ref().is_some_and(|root| {
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
    eprintln!("[GridCode] Claude binary: {}", claude_path);
    eprintln!("[GridCode] Working dir: {}", actual_dir);

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

    // Buffer PTY output until frontend connects its event listeners
    let (connect_tx, connect_rx) = tokio::sync::oneshot::channel::<()>();
    state.connect_signals.lock().await.insert(session_id.clone(), connect_tx);

    let app_handle = app.clone();
    let sid = session_id.clone();
    eprintln!("[GridCode] Session {} created, waiting for frontend connect", session_id);

    tokio::spawn(async move {
        // Wait for frontend to signal it's ready (or timeout after 5s as fallback)
        tokio::select! {
            _ = connect_rx => { eprintln!("[GridCode] Session {} connected by frontend", sid); },
            _ = tokio::time::sleep(std::time::Duration::from_secs(5)) => { eprintln!("[GridCode] Session {} connect timed out, starting anyway", sid); },
        }

        let mut count = 0u64;
        // Now stream all output (mpsc unbounded channel has been buffering)
        while let Some(data) = rx.recv().await {
            count += data.len() as u64;
            if count <= 1000 || count % 10000 < 100 {
                eprintln!("[GridCode] Session {} emitting {} bytes (total: {})", sid, data.len(), count);
            }
            let _ = app_handle.emit(
                "pty-output",
                PtyOutput {
                    session_id: sid.clone(),
                    data,
                },
            );
        }
        eprintln!("[GridCode] Session {} ended (total bytes: {})", sid, count);
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

    // Clean up worktrees before removing sessions
    {
        let sessions = state.sessions.lock().await;
        for s in sessions.iter().filter(|s| s.workspace_id == workspace_id) {
            if let Some(wt_path) = &s.worktree_path {
                if let Some(root) = WorktreeManager::git_root(&s.working_dir) {
                    let _ = WorktreeManager::remove_worktree(&root, wt_path);
                }
            }
        }
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
    let pane_number = sessions.iter().filter(|s| s.workspace_id == workspace_id).count() as u32 + 1;
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

    // Buffer PTY output until frontend connects its event listeners
    let (connect_tx, connect_rx) = tokio::sync::oneshot::channel::<()>();
    state.connect_signals.lock().await.insert(session_id.clone(), connect_tx);

    let app_handle = app.clone();
    let sid = session_id.clone();
    tokio::spawn(async move {
        // Wait for frontend to signal it's ready (or timeout after 5s as fallback)
        tokio::select! {
            _ = connect_rx => {},
            _ = tokio::time::sleep(std::time::Duration::from_secs(5)) => {},
        }

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

// === Connect PTY (frontend signals it's ready to receive output) ===

#[tauri::command]
pub async fn connect_pty(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), String> {
    if let Some(tx) = state.connect_signals.lock().await.remove(&session_id) {
        let _ = tx.send(());
    }
    Ok(())
}

// === Git Clone Commands ===

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitHubRepo {
    pub name: String,
    pub full_name: String,
    pub description: String,
    pub url: String,
    pub clone_url: String,
    pub stars: u32,
    pub language: String,
    pub updated_at: String,
    pub is_private: bool,
    pub is_fork: bool,
}

/// Resolve the `gh` binary path, augmenting PATH with common macOS/Linux locations
/// so it works even when the app is launched from Finder/Dock (limited PATH).
fn resolve_gh_path() -> Result<String, String> {
    // Try the current PATH first
    if let Ok(p) = which::which("gh") {
        return Ok(p.to_string_lossy().to_string());
    }
    // Augment PATH with common install locations and retry
    let extra_paths = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/home/linuxbrew/.linuxbrew/bin",
    ];
    if let Ok(current) = std::env::var("PATH") {
        let augmented = format!("{}:{}", extra_paths.join(":"), current);
        std::env::set_var("PATH", &augmented);
        if let Ok(p) = which::which("gh") {
            return Ok(p.to_string_lossy().to_string());
        }
    }
    Err("GitHub CLI (gh) not found. Install with: brew install gh".to_string())
}

#[tauri::command]
pub async fn search_github_repos(
    query: String,
    limit: Option<u32>,
) -> Result<Vec<GitHubRepo>, String> {
    let gh_path = resolve_gh_path()?;

    let limit_str = (limit.unwrap_or(20)).to_string();

    // Sanitize query
    let clean_query = query.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_' && c != '.' && c != '/' && c != ' ', "");

    // gh search repos uses different field names than gh repo list:
    //   language (string), stargazersCount, fullName
    let search_fields = "name,fullName,description,url,stargazersCount,language,updatedAt,isPrivate,isFork";

    let output = std::process::Command::new(&gh_path)
        .args([
            "search", "repos",
            &clean_query,
            "--json", search_fields,
            "--limit", &limit_str,
        ])
        .output()
        .map_err(|e| format!("Failed to run gh search: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Search failed: {}", stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    parse_gh_results(&json_str)
}

/// Parse JSON output from either `gh repo list` or `gh search repos`.
/// Handles field name differences between the two commands:
///   gh repo list:   nameWithOwner, stargazerCount, primaryLanguage (object)
///   gh search repos: fullName, stargazersCount, language (string)
fn parse_gh_results(json_str: &str) -> Result<Vec<GitHubRepo>, String> {
    let raw: Vec<serde_json::Value> = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse gh output: {}", e))?;

    Ok(raw.iter().map(|r| {
        // full_name: try fullName (search) then nameWithOwner (list)
        let full_name = r["fullName"].as_str()
            .or_else(|| r["nameWithOwner"].as_str())
            .unwrap_or("").to_string();

        // stars: try stargazersCount (search) then stargazerCount (list)
        let stars = r["stargazersCount"].as_u64()
            .or_else(|| r["stargazerCount"].as_u64())
            .unwrap_or(0) as u32;

        // language: try as string first (search), then as object with .name (list)
        let language = r["language"].as_str()
            .map(|s| s.to_string())
            .or_else(|| {
                r["primaryLanguage"].as_object()
                    .and_then(|l| l.get("name"))
                    .and_then(|n| n.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_default();

        GitHubRepo {
            name: r["name"].as_str().unwrap_or("").to_string(),
            full_name,
            description: r["description"].as_str().unwrap_or("").to_string(),
            url: r["url"].as_str().unwrap_or("").to_string(),
            clone_url: r["url"].as_str().unwrap_or("").to_string(),
            stars,
            language,
            updated_at: r["updatedAt"].as_str().unwrap_or("").to_string(),
            is_private: r["isPrivate"].as_bool().unwrap_or(false),
            is_fork: r["isFork"].as_bool().unwrap_or(false),
        }
    }).collect())
}

#[tauri::command]
pub async fn list_github_repos(
    owner: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<GitHubRepo>, String> {
    let gh_path = resolve_gh_path()?;

    let limit_str = (limit.unwrap_or(100)).to_string();

    let mut args = vec![
        "repo".to_string(), "list".to_string(),
    ];
    if let Some(ref org) = owner {
        // Sanitize org name
        let clean = org.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "");
        args.push(clean);
    }
    args.extend_from_slice(&[
        "--json".to_string(), "name,nameWithOwner,description,url,stargazerCount,primaryLanguage,updatedAt,isPrivate,isFork".to_string(),
        "--limit".to_string(), limit_str,
    ]);

    let output = std::process::Command::new(&gh_path)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run gh: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh failed: {}. Run 'gh auth login' to authenticate.", stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    parse_gh_results(&json_str)
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

    dirs.truncate(100);
    Ok(dirs)
}

// === Repo Quick Status (for project lists) ===

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoQuickStatus {
    pub is_git: bool,
    pub has_remote: bool,
    pub branch: Option<String>,
}

#[tauri::command]
pub async fn check_repo_status(path: String) -> Result<RepoQuickStatus, String> {
    let p = std::path::Path::new(&path);
    if !p.is_dir() {
        return Ok(RepoQuickStatus { is_git: false, has_remote: false, branch: None });
    }
    let git_dir = p.join(".git");
    if !git_dir.exists() {
        return Ok(RepoQuickStatus { is_git: false, has_remote: false, branch: None });
    }
    let branch = run_git(&path, &["rev-parse", "--abbrev-ref", "HEAD"]).ok();
    let remote_url = run_git(&path, &["remote", "get-url", "origin"]).unwrap_or_default();
    let has_remote = !remote_url.is_empty();
    Ok(RepoQuickStatus { is_git: true, has_remote, branch })
}

// === GitHub Identity ===

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitHubIdentity {
    pub username: String,
    pub orgs: Vec<String>,
}

#[tauri::command]
pub async fn get_github_identity() -> Result<GitHubIdentity, String> {
    let gh_path = resolve_gh_path()?;

    let username = std::process::Command::new(&gh_path)
        .args(["api", "user", "--jq", ".login"])
        .output()
        .ok()
        .and_then(|o| if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else { None })
        .unwrap_or_default();

    let orgs_output = std::process::Command::new(&gh_path)
        .args(["api", "user/orgs", "--jq", ".[].login"])
        .output()
        .ok()
        .and_then(|o| if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).to_string())
        } else { None })
        .unwrap_or_default();

    let orgs: Vec<String> = orgs_output.lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    Ok(GitHubIdentity { username, orgs })
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
            if path.extension().is_some_and(|e| e == "md" || e == "txt") {
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
        let index = line.chars().next().unwrap_or(' ');
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
    if branch_name.starts_with('-') {
        return Err("Invalid branch name: must not start with '-'".to_string());
    }
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
    // Validate branch name - reject shell metacharacters and flag-like names
    if branch_name.starts_with('-') {
        return Err("Invalid branch name: must not start with '-'".to_string());
    }
    if branch_name.contains(|c: char| " \t\n\r$`|;&<>(){}".contains(c)) {
        return Err("Invalid branch name: contains special characters".to_string());
    }
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
        // Skip if local branch exists with matching name (e.g. "origin/main" -> "main")
        let short_name = name.split('/').skip(1).collect::<Vec<_>>().join("/");
        if branches.iter().any(|b| b.name == short_name) { continue; }
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

#[tauri::command]
pub async fn git_diff_file(working_dir: String, file_path: String, staged: bool) -> Result<String, String> {
    let dir = validate_dir(&working_dir)?;
    validate_file_path(&file_path)?;

    // Try to get diff first
    let result = if staged {
        run_git(&dir, &["diff", "--cached", "--", &file_path])
    } else {
        run_git(&dir, &["diff", "--", &file_path])
    };

    match result {
        Ok(diff) if !diff.is_empty() => Ok(diff),
        _ => {
            // For untracked files or empty diff, try to show file content as all-additions
            let full_path = std::path::Path::new(&dir).join(&file_path);
            if full_path.exists() {
                let content = std::fs::read_to_string(&full_path)
                    .map_err(|e| format!("Failed to read file: {}", e))?;
                let lines: Vec<String> = content.lines().map(|l| format!("+{}", l)).collect();
                let header = format!(
                    "--- /dev/null\n+++ b/{}\n@@ -0,0 +1,{} @@\n{}",
                    file_path,
                    lines.len(),
                    lines.join("\n")
                );
                Ok(header)
            } else {
                Ok("(file deleted)".to_string())
            }
        }
    }
}

// === File Tree Commands ===

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileEntry>>,
    pub is_gitignored: bool,
}

/// Directories that are always skipped in the file tree.
const ALWAYS_SKIP: &[&str] = &[
    ".git", "node_modules", "target", "__pycache__", ".next",
    "dist", "build", ".turbo", ".cache", "venv", ".venv",
    ".DS_Store", ".idea", ".vscode",
];

/// Simple gitignore pattern matcher.  Supports:
///   - exact file/dir names  (e.g. `coverage`)
///   - leading wildcard       (e.g. `*.log`)
///   - trailing slash dirs    (e.g. `logs/`)
///   - negation lines are skipped (lines starting with `!`)
///   - comment lines starting with `#`
fn parse_gitignore(root: &str) -> Vec<String> {
    let path = format!("{}/.gitignore", root);
    match std::fs::read_to_string(&path) {
        Ok(content) => content
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with('!'))
            .map(|l| l.trim_end_matches('/').to_string())
            .collect(),
        Err(_) => Vec::new(),
    }
}

fn matches_gitignore(name: &str, patterns: &[String]) -> bool {
    for pat in patterns {
        if pat == name {
            return true;
        }
        // *.ext pattern
        if let Some(suffix) = pat.strip_prefix('*') {
            if name.ends_with(suffix) {
                return true;
            }
        }
    }
    false
}

fn build_file_tree(
    dir: &str,
    depth: u32,
    max_depth: u32,
    gitignore_patterns: &[String],
) -> Vec<FileEntry> {
    if depth >= max_depth {
        return Vec::new();
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut dirs: Vec<FileEntry> = Vec::new();
    let mut files: Vec<FileEntry> = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip entries in the always-skip list (.git, node_modules, target, etc.)
        if ALWAYS_SKIP.contains(&name.as_str()) {
            continue;
        }

        let is_gitignored = matches_gitignore(&name, gitignore_patterns);

        // Skip gitignored entries
        if is_gitignored {
            continue;
        }

        let path = format!("{}/{}", dir, name);
        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

        if is_dir {
            // For directories, children are loaded lazily on the frontend.
            // Only pre-load children for shallow depths to keep initial load fast.
            let children = if depth + 1 < max_depth {
                Some(build_file_tree(&path, depth + 1, max_depth, gitignore_patterns))
            } else {
                // Signal that this dir has potential children (non-empty marker)
                None
            };
            dirs.push(FileEntry {
                name,
                path,
                is_dir: true,
                children,
                is_gitignored: false,
            });
        } else {
            files.push(FileEntry {
                name,
                path,
                is_dir: false,
                children: None,
                is_gitignored: false,
            });
        }
    }

    // Sort: directories first, then files, alphabetical within each
    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    dirs.extend(files);
    dirs
}

/// Collect gitignore patterns from the given directory and all parent directories
/// up to the repository root (or filesystem root).
fn collect_gitignore_patterns(dir: &str) -> Vec<String> {
    let mut patterns = Vec::new();
    let mut current = std::path::PathBuf::from(dir);
    loop {
        let gi = current.join(".gitignore");
        if gi.exists() {
            patterns.extend(parse_gitignore(current.to_str().unwrap_or("")));
        }
        // Stop at repository root (has .git dir) or filesystem root
        if current.join(".git").is_dir() || !current.pop() {
            break;
        }
    }
    patterns.sort();
    patterns.dedup();
    patterns
}

#[tauri::command]
pub async fn list_directory(path: String, max_depth: Option<u32>) -> Result<Vec<FileEntry>, String> {
    let dir = validate_dir(&path)?;
    let depth_limit = max_depth.unwrap_or(3).min(6); // cap at 6 to prevent huge trees
    let gitignore_patterns = collect_gitignore_patterns(&dir);
    Ok(build_file_tree(&dir, 0, depth_limit, &gitignore_patterns))
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
    #[serde(rename = "type")]
    pub server_type: String, // "stdio" or "http"
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpConfigFile {
    #[serde(rename = "mcpServers", default)]
    pub mcp_servers: std::collections::HashMap<String, McpServerEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpServerEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "std::collections::HashMap::is_empty")]
    pub env: std::collections::HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disabled: Option<bool>,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub server_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headers: Option<std::collections::HashMap<String, String>>,
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
                // Skip if a server with this name was already loaded from a prior global config
                if servers.iter().any(|s| s.name == *name && s.scope == "global") {
                    continue;
                }
                let stype = entry.server_type.clone().unwrap_or_else(|| {
                    if entry.url.is_some() { "http".to_string() } else { "stdio".to_string() }
                });
                servers.push(McpServerConfig {
                    name: name.clone(),
                    command: entry.command.clone().unwrap_or_default(),
                    args: entry.args.clone(),
                    env: entry.env.clone(),
                    enabled: !entry.disabled.unwrap_or(false),
                    scope: "global".to_string(),
                    source_file: gpath.clone(),
                    server_type: stype,
                    url: entry.url.clone(),
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
                    let stype = entry.server_type.clone().unwrap_or_else(|| {
                        if entry.url.is_some() { "http".to_string() } else { "stdio".to_string() }
                    });
                    servers.push(McpServerConfig {
                        name: name.clone(),
                        command: entry.command.clone().unwrap_or_default(),
                        args: entry.args.clone(),
                        env: entry.env.clone(),
                        enabled: !entry.disabled.unwrap_or(false),
                        scope: "project".to_string(),
                        source_file: ppath.clone(),
                        server_type: stype,
                        url: entry.url.clone(),
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

    // Ensure parent directory exists
    let path = std::path::Path::new(&config_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Preserve existing file structure if it exists
    let mut doc: serde_json::Value = if let Ok(content) = std::fs::read_to_string(&config_path) {
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let servers_value = serde_json::to_value(&servers)
        .map_err(|e| format!("Failed to serialize servers: {}", e))?;
    doc.as_object_mut()
        .ok_or("Config is not an object")?
        .insert("mcpServers".to_string(), servers_value);

    let json = serde_json::to_string_pretty(&doc)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
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
    let mut doc: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let servers = doc.get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| format!("No mcpServers found in {}", config_path))?;

    let server = servers.get_mut(&server_name)
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| format!("Server '{}' not found in {}", server_name, config_path))?;

    if enabled {
        server.remove("disabled");
    } else {
        server.insert("disabled".to_string(), serde_json::Value::Bool(true));
    }

    let json = serde_json::to_string_pretty(&doc)
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
    let mut doc: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let servers = doc.get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| format!("No mcpServers found in {}", config_path))?;

    if servers.remove(&server_name).is_none() {
        return Err(format!("Server '{}' not found in {}", server_name, config_path));
    }

    let json = serde_json::to_string_pretty(&doc)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn add_mcp_server(
    config_path: String,
    name: String,
    command: Option<String>,
    args: Vec<String>,
    env: std::collections::HashMap<String, String>,
    url: Option<String>,
    server_type: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    validate_mcp_config_path(&config_path)?;

    // Must provide either command (stdio) or url (http)
    if command.is_none() && url.is_none() {
        return Err("Must provide either 'command' (stdio) or 'url' (http)".to_string());
    }

    // Validate command doesn't contain path traversal or shell tricks
    if let Some(ref cmd) = command {
        if cmd.contains("..") || cmd.contains(';') || cmd.contains('|') || cmd.contains('&') {
            return Err("Invalid command: contains prohibited characters".to_string());
        }
    }

    // Validate URL if provided
    if let Some(ref u) = url {
        if !u.starts_with("http://") && !u.starts_with("https://") {
            return Err("Invalid URL: must start with http:// or https://".to_string());
        }
    }

    let path = std::path::Path::new(&config_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Preserve existing file structure
    let mut doc: serde_json::Value = if let Ok(content) = std::fs::read_to_string(&config_path) {
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let new_entry = McpServerEntry {
        command,
        args,
        env,
        disabled: None,
        server_type: server_type.or_else(|| if url.is_some() { Some("http".to_string()) } else { None }),
        url,
        headers,
    };

    let entry_value = serde_json::to_value(&new_entry)
        .map_err(|e| format!("Failed to serialize entry: {}", e))?;

    let obj = doc.as_object_mut().ok_or("Config is not an object")?;
    let servers = obj.entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));
    servers.as_object_mut()
        .ok_or("mcpServers is not an object")?
        .insert(name, entry_value);

    let json = serde_json::to_string_pretty(&doc)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

// === Git Setup Wizard Commands ===

#[derive(Debug, Serialize, Clone)]
pub struct GitSetupStatus {
    pub git_installed: bool,
    pub git_user_name: Option<String>,
    pub git_user_email: Option<String>,
    pub gh_installed: bool,
    pub gh_authenticated: bool,
    pub gh_username: Option<String>,
    pub ssh_key_exists: bool,
}

#[tauri::command]
pub async fn check_git_setup() -> Result<GitSetupStatus, String> {
    let git_installed = which::which("git").is_ok();

    let git_user_name = if git_installed {
        std::process::Command::new("git")
            .args(["config", "--global", "user.name"])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    if s.is_empty() { None } else { Some(s) }
                } else {
                    None
                }
            })
    } else {
        None
    };

    let git_user_email = if git_installed {
        std::process::Command::new("git")
            .args(["config", "--global", "user.email"])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    if s.is_empty() { None } else { Some(s) }
                } else {
                    None
                }
            })
    } else {
        None
    };

    let gh_path = resolve_gh_path().ok();
    let gh_installed = gh_path.is_some();

    let gh_authenticated = if let Some(ref gh) = gh_path {
        std::process::Command::new(gh)
            .args(["auth", "status"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    } else {
        false
    };

    let gh_username = if let Some(ref gh) = gh_path {
        if gh_authenticated {
            std::process::Command::new(gh)
                .args(["api", "user", "--jq", ".login"])
                .output()
                .ok()
                .and_then(|o| {
                    if o.status.success() {
                        let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                        if s.is_empty() { None } else { Some(s) }
                    } else {
                        None
                    }
                })
        } else {
            None
        }
    } else {
        None
    };

    let home = std::env::var("HOME").unwrap_or_default();
    let ssh_key_exists = std::path::Path::new(&format!("{}/.ssh/id_ed25519.pub", home)).exists()
        || std::path::Path::new(&format!("{}/.ssh/id_rsa.pub", home)).exists();

    Ok(GitSetupStatus {
        git_installed,
        git_user_name,
        git_user_email,
        gh_installed,
        gh_authenticated,
        gh_username,
        ssh_key_exists,
    })
}

#[tauri::command]
pub async fn set_git_config(name: String, email: String) -> Result<(), String> {
    if name.contains('\n') || name.contains('\r') || name.contains('\0') {
        return Err("Invalid name: contains prohibited characters".to_string());
    }
    if email.contains('\n') || email.contains('\r') || email.contains('\0') {
        return Err("Invalid email: contains prohibited characters".to_string());
    }

    let git_path = which::which("git")
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|_| "git not found".to_string())?;

    let output = std::process::Command::new(&git_path)
        .args(["config", "--global", "user.name", &name])
        .output()
        .map_err(|e| format!("Failed to set git user.name: {}", e))?;
    if !output.status.success() {
        return Err(format!("Failed to set git user.name: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let output = std::process::Command::new(&git_path)
        .args(["config", "--global", "user.email", &email])
        .output()
        .map_err(|e| format!("Failed to set git user.email: {}", e))?;
    if !output.status.success() {
        return Err(format!("Failed to set git user.email: {}", String::from_utf8_lossy(&output.stderr)));
    }

    Ok(())
}

#[tauri::command]
pub async fn run_gh_auth_login() -> Result<String, String> {
    let gh_path = which::which("gh")
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|_| "GitHub CLI (gh) not found".to_string())?;

    let output = std::process::Command::new(&gh_path)
        .args(["auth", "login", "--web", "-p", "https"])
        .output()
        .map_err(|e| format!("Failed to run gh auth login: {}", e))?;

    if output.status.success() {
        Ok("Authentication successful".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("gh auth requires interactive login. Run 'gh auth login' in a terminal session. {}", stderr))
    }
}

#[tauri::command]
pub async fn get_gh_install_instructions() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        Ok("brew install gh".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        Ok("sudo apt install gh  # Debian/Ubuntu\nsudo dnf install gh  # Fedora\n# See https://github.com/cli/cli/blob/trunk/docs/install_linux.md".to_string())
    }
    #[cfg(target_os = "windows")]
    {
        Ok("winget install --id GitHub.cli".to_string())
    }
}

// === Code Viewer ===

/// Binary-looking file extensions that should not be read as text.
const BINARY_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "avif", "tiff", "tif",
    "mp3", "mp4", "wav", "ogg", "webm", "avi", "mov", "flac", "aac",
    "zip", "tar", "gz", "bz2", "xz", "7z", "rar", "zst",
    "exe", "dll", "so", "dylib", "a", "o", "obj", "class",
    "woff", "woff2", "ttf", "otf", "eot",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "sqlite", "db", "sqlite3",
    "wasm",
];

/// Maximum file size we will read (10 MB).
const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;

#[tauri::command]
pub async fn read_file_contents(file_path: String) -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    if !file_path.starts_with(&home) && !file_path.starts_with("/tmp") {
        return Err("File must be under home directory".to_string());
    }
    if file_path.contains("..") {
        return Err("Path traversal not allowed".to_string());
    }

    // Reject known binary extensions
    let lower = file_path.to_lowercase();
    if let Some(ext) = lower.rsplit('.').next() {
        if BINARY_EXTENSIONS.contains(&ext) {
            return Err(format!("Binary file type (.{}) cannot be displayed as text", ext));
        }
    }

    // Check file size before reading
    let metadata = std::fs::metadata(&file_path)
        .map_err(|e| format!("Failed to stat file: {}", e))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File too large ({:.1} MB). Maximum is {} MB.",
            metadata.len() as f64 / (1024.0 * 1024.0),
            MAX_FILE_SIZE / (1024 * 1024)
        ));
    }
    if metadata.len() == 0 {
        return Ok(String::new());
    }

    // Read the file; if it contains invalid UTF-8, report it as binary
    let bytes = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    String::from_utf8(bytes)
        .map_err(|_| "Binary file: contents are not valid UTF-8 text".to_string())
}