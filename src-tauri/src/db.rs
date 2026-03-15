use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::session::Session;
use crate::workspace::Workspace;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self, String> {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create DB directory: {}", e))?;
        }

        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn db_path() -> PathBuf {
        let mut path = dirs_path();
        path.push("gridcode.db");
        path
    }

    fn init_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                layout_json TEXT,
                created_at TEXT NOT NULL,
                is_active INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                working_dir TEXT NOT NULL,
                command TEXT NOT NULL,
                git_branch TEXT,
                created_at TEXT NOT NULL,
                pane_number INTEGER NOT NULL,
                worktree_path TEXT,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
        )
        .map_err(|e| format!("Failed to initialize tables: {}", e))?;
        Ok(())
    }

    // Workspace operations
    pub fn save_workspace(&self, workspace: &Workspace) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO workspaces (id, name, layout_json, created_at, is_active) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![workspace.id, workspace.name, workspace.layout_json, workspace.created_at, workspace.is_active as i32],
        )
        .map_err(|e| format!("Failed to save workspace: {}", e))?;
        Ok(())
    }

    pub fn load_workspaces(&self) -> Result<Vec<Workspace>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, layout_json, created_at, is_active FROM workspaces ORDER BY created_at")
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let workspaces = stmt
            .query_map([], |row| {
                Ok(Workspace {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    layout_json: row.get(2)?,
                    created_at: row.get(3)?,
                    is_active: row.get::<_, i32>(4)? != 0,
                })
            })
            .map_err(|e| format!("Failed to query workspaces: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(workspaces)
    }

    pub fn delete_workspace(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sessions WHERE workspace_id = ?1", params![id])
            .map_err(|e| format!("Failed to delete sessions: {}", e))?;
        conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete workspace: {}", e))?;
        Ok(())
    }

    pub fn set_active_workspace(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE workspaces SET is_active = 0", [])
            .map_err(|e| format!("Failed to deactivate workspaces: {}", e))?;
        conn.execute(
            "UPDATE workspaces SET is_active = 1 WHERE id = ?1",
            params![id],
        )
        .map_err(|e| format!("Failed to activate workspace: {}", e))?;
        Ok(())
    }

    // Session operations
    pub fn save_session(&self, session: &Session) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO sessions (id, workspace_id, working_dir, command, git_branch, created_at, pane_number, worktree_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![session.id, session.workspace_id, session.working_dir, session.command, session.git_branch, session.created_at, session.pane_number, session.worktree_path],
        )
        .map_err(|e| format!("Failed to save session: {}", e))?;
        Ok(())
    }

    pub fn load_sessions(&self, workspace_id: &str) -> Result<Vec<Session>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, workspace_id, working_dir, command, git_branch, created_at, pane_number, worktree_path FROM sessions WHERE workspace_id = ?1 ORDER BY pane_number")
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let sessions = stmt
            .query_map(params![workspace_id], |row| {
                Ok(Session {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    working_dir: row.get(2)?,
                    command: row.get(3)?,
                    git_branch: row.get(4)?,
                    status: crate::session::SessionStatus::Dead,
                    created_at: row.get(5)?,
                    pane_number: row.get(6)?,
                    worktree_path: row.get(7)?,
                })
            })
            .map_err(|e| format!("Failed to query sessions: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(sessions)
    }

    pub fn delete_session(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete session: {}", e))?;
        Ok(())
    }

    // Settings operations
    pub fn get_setting(&self, key: &str) -> Option<String> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| format!("Failed to save setting: {}", e))?;
        Ok(())
    }

    pub fn save_layout(&self, workspace_id: &str, layout_json: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE workspaces SET layout_json = ?1 WHERE id = ?2",
            params![layout_json, workspace_id],
        )
        .map_err(|e| format!("Failed to save layout: {}", e))?;
        Ok(())
    }
}

fn dirs_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        let mut path = PathBuf::from(home);
        path.push(".config");
        path.push("gridcode");
        path
    } else {
        PathBuf::from("/tmp/gridcode")
    }
}
