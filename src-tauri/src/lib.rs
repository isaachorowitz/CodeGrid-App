mod commands;
mod db;
mod pty_manager;
mod session;
mod workspace;
mod worktree;

use commands::AppState;
use db::Database;
use pty_manager::PtyManager;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex as TokioMutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|_app| {
            let db = Database::new().expect("Failed to initialize database");
            let state = Arc::new(AppState {
                pty_manager: PtyManager::new(),
                db,
                sessions: TokioMutex::new(Vec::new()),
            });
            _app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::write_to_pty,
            commands::resize_pty,
            commands::kill_session,
            commands::get_sessions,
            commands::update_session_status,
            commands::create_workspace,
            commands::get_workspaces,
            commands::delete_workspace,
            commands::set_active_workspace,
            commands::save_layout,
            commands::rename_workspace,
            commands::get_git_branch,
            commands::is_git_repo,
            commands::get_claude_path,
            commands::get_setting,
            commands::set_setting,
            commands::get_default_shell,
            commands::spawn_shell_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GridCode");
}
