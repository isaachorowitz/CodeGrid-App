use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

pub struct PtyInstance {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn portable_pty::Child + Send>,
}

pub struct PtyManager {
    instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

fn lock_instances(
    instances: &Mutex<HashMap<String, PtyInstance>>,
) -> Result<std::sync::MutexGuard<'_, HashMap<String, PtyInstance>>, String> {
    instances
        .lock()
        .map_err(|_| "Internal error: PTY manager lock poisoned".to_string())
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn_session(
        &self,
        session_id: &str,
        working_dir: &str,
        command: &str,
        args: &[String],
        cols: u16,
        rows: u16,
    ) -> Result<mpsc::UnboundedReceiver<Vec<u8>>, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {e}"))?;

        let mut cmd = CommandBuilder::new(command);
        for arg in args {
            cmd.arg(arg);
        }
        cmd.cwd(working_dir);

        // Inherit environment
        #[cfg(unix)]
        {
            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");
            if let Ok(home) = std::env::var("HOME") {
                cmd.env("HOME", &home);
            }
            if let Ok(path) = std::env::var("PATH") {
                cmd.env("PATH", &path);
            }
            if let Ok(shell) = std::env::var("SHELL") {
                cmd.env("SHELL", &shell);
            }
            if let Ok(user) = std::env::var("USER") {
                cmd.env("USER", &user);
            }
            if let Ok(lang) = std::env::var("LANG") {
                cmd.env("LANG", &lang);
            }
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {e}"))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {e}"))?;

        // Set up output reading
        let (tx, rx) = mpsc::unbounded_channel();
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

        let sid = session_id.to_string();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        // EIO is expected when PTY child exits on Unix.
                        // On macOS this surfaces as ErrorKind::Other with raw_os_error 5 (EIO).
                        // Only log unexpected errors.
                        let is_eio = e.raw_os_error() == Some(5); // libc::EIO
                        if !is_eio {
                            eprintln!("PTY read error for session {}: {} (kind={:?}, os_error={:?})", sid, e, e.kind(), e.raw_os_error());
                        }
                        break;
                    }
                }
            }
        });

        let instance = PtyInstance {
            master: pair.master,
            writer,
            child,
        };

        lock_instances(&self.instances)?
            .insert(session_id.to_string(), instance);

        Ok(rx)
    }

    pub fn write_to_pty(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let mut instances = lock_instances(&self.instances)?;
        if let Some(instance) = instances.get_mut(session_id) {
            instance
                .writer
                .write_all(data)
                .map_err(|e| format!("Failed to write to PTY: {e}"))?;
            instance
                .writer
                .flush()
                .map_err(|e| format!("Failed to flush PTY: {e}"))?;
            Ok(())
        } else {
            Err(format!("Session {session_id} not found"))
        }
    }

    pub fn resize_pty(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let instances = lock_instances(&self.instances)?;
        if let Some(instance) = instances.get(session_id) {
            instance
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Failed to resize PTY: {e}"))?;
            Ok(())
        } else {
            Err(format!("Session {session_id} not found"))
        }
    }

    pub fn kill_session(&self, session_id: &str) -> Result<(), String> {
        let mut instances = lock_instances(&self.instances)?;
        if let Some(mut instance) = instances.remove(session_id) {
            let _ = instance.child.kill();
            // Wait for child to avoid zombie processes
            let _ = instance.child.wait();
            Ok(())
        } else {
            Err(format!("Session {session_id} not found"))
        }
    }

    pub fn remove_session(&self, session_id: &str) -> Result<(), String> {
        let mut instances = lock_instances(&self.instances)?;
        if let Some(mut instance) = instances.remove(session_id) {
            let _ = instance.child.wait();
            Ok(())
        } else {
            Ok(())
        }
    }

    #[allow(dead_code)]
    pub fn is_alive(&self, session_id: &str) -> bool {
        let Ok(mut instances) = lock_instances(&self.instances) else {
            return false;
        };
        if let Some(instance) = instances.get_mut(session_id) {
            match instance.child.try_wait() {
                Ok(None) => true,
                Ok(Some(_)) | Err(_) => false,
            }
        } else {
            false
        }
    }

    #[allow(dead_code)]
    pub fn session_count(&self) -> usize {
        lock_instances(&self.instances).map(|i| i.len()).unwrap_or(0)
    }

    /// Kill all PTY sessions. Called on app exit to prevent zombie processes.
    pub fn kill_all(&self) {
        if let Ok(mut instances) = self.instances.lock() {
            for (sid, mut instance) in instances.drain() {
                eprintln!("[CodeGrid] Killing PTY session {sid} on shutdown");
                let _ = instance.child.kill();
                let _ = instance.child.wait();
            }
        }
    }

    /// Returns the list of active session IDs (for diagnostics).
    #[allow(dead_code)]
    pub fn active_session_ids(&self) -> Vec<String> {
        lock_instances(&self.instances)
            .map(|i| i.keys().cloned().collect())
            .unwrap_or_default()
    }
}

/// Safety net: kill all child processes if `PtyManager` is dropped without
/// an explicit `kill_all` call (e.g. during a panic unwind).
impl Drop for PtyManager {
    fn drop(&mut self) {
        self.kill_all();
    }
}
