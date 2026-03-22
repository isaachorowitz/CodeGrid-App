mod commands;
mod db;
mod license;
mod pty_manager;
mod session;
mod workspace;
mod worktree;

use commands::AppState;
use db::Database;
use pty_manager::PtyManager;
use std::sync::Arc;
use tauri::{Manager, RunEvent, WindowEvent};
use tokio::sync::Mutex as TokioMutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            let db = Database::new().expect("Failed to initialize database");
            let state = Arc::new(AppState {
                pty_manager: PtyManager::new(),
                db,
                sessions: TokioMutex::new(Vec::new()),
                connect_signals: TokioMutex::new(std::collections::HashMap::new()),
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
            commands::get_persisted_sessions,
            commands::rename_session,
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
            commands::clone_repo,
            commands::get_home_dir,
            commands::create_project_dir,
            commands::list_recent_dirs,
            commands::detect_claude_skills,
            commands::get_available_models,
            commands::send_to_session,
            commands::dir_exists,
            // Git manager
            commands::git_status,
            commands::git_push,
            commands::git_pull,
            commands::git_commit,
            commands::git_stage_file,
            commands::git_unstage_file,
            commands::git_create_branch,
            commands::git_switch_branch,
            commands::git_list_branches,
            commands::git_log,
            commands::git_discard_file,
            commands::git_stage_all,
            commands::git_show_commit,
            commands::git_fetch,
            commands::git_stash,
            commands::git_diff_stat,
            commands::git_diff_file,
            // Workspace-repo binding
            commands::set_workspace_repo,
            commands::create_workspace_with_repo,
            // CLAUDE.md management
            commands::read_claude_md,
            commands::write_claude_md,
            // MCP manager
            commands::list_mcps,
            commands::save_mcp_config,
            commands::toggle_mcp_server,
            commands::remove_mcp_server,
            commands::add_mcp_server,
            commands::connect_pty,
            commands::list_github_repos,
            commands::search_github_repos,
            // File tree
            commands::list_directory,
            commands::create_folder,
            // File operations
            commands::rename_file,
            commands::delete_file,
            commands::move_file,
            commands::copy_file,
            // Project search
            commands::search_files,
            // Git hunk staging
            commands::git_stage_hunk,
            // Git setup wizard
            commands::check_git_setup,
            commands::set_git_config,
            commands::run_gh_auth_login,
            commands::get_gh_install_instructions,
            commands::run_gh_setup_git,
            commands::start_github_device_flow,
            commands::poll_github_token,
            commands::save_github_token,
            // Code viewer
            commands::read_file_contents,
            commands::write_file_contents,
            // Repo quick status
            commands::check_repo_status,
            commands::get_github_identity,
            // Quick publish / save
            commands::quick_publish,
            commands::quick_save,
            commands::get_env_allow_status,
            commands::toggle_env_allow,
            // License management
            commands::get_license_status,
            commands::activate_license,
            commands::deactivate_license,
            commands::generate_license_key_cmd,
        ])
        // Hide window on close (red X) instead of quitting so PTY sessions
        // stay alive. Cmd+Q / File→Quit still exits normally.
        // On macOS, clicking the dock icon fires RunEvent::Reopen to show it again.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building CodeGrid");

    app.run(|app_handle, event| {
        match event {
            RunEvent::Exit => {
                eprintln!("[CodeGrid] App exiting, cleaning up PTY sessions");
                if let Some(state) = app_handle.try_state::<Arc<AppState>>() {
                    state.pty_manager.kill_all();
                }
            }
            // macOS: dock icon clicked while app is running → show window
            RunEvent::Reopen { has_visible_windows, .. } => {
                if !has_visible_windows {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            _ => {}
        }
    });
}
