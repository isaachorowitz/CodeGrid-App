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
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

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
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        // Set up output reading
        let (tx, rx) = mpsc::unbounded_channel();
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let sid = session_id.to_string();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        log::error!("PTY read error for session {}: {}", sid, e);
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

        self.instances
            .lock()
            .unwrap()
            .insert(session_id.to_string(), instance);

        Ok(rx)
    }

    pub fn write_to_pty(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        if let Some(instance) = instances.get_mut(session_id) {
            instance
                .writer
                .write_all(data)
                .map_err(|e| format!("Failed to write to PTY: {}", e))?;
            instance
                .writer
                .flush()
                .map_err(|e| format!("Failed to flush PTY: {}", e))?;
            Ok(())
        } else {
            Err(format!("Session {} not found", session_id))
        }
    }

    pub fn resize_pty(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let instances = self.instances.lock().unwrap();
        if let Some(instance) = instances.get(session_id) {
            instance
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Failed to resize PTY: {}", e))?;
            Ok(())
        } else {
            Err(format!("Session {} not found", session_id))
        }
    }

    pub fn kill_session(&self, session_id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        if let Some(mut instance) = instances.remove(session_id) {
            let _ = instance.child.kill();
            Ok(())
        } else {
            Err(format!("Session {} not found", session_id))
        }
    }

    pub fn is_alive(&self, session_id: &str) -> bool {
        let mut instances = self.instances.lock().unwrap();
        if let Some(instance) = instances.get_mut(session_id) {
            match instance.child.try_wait() {
                Ok(Some(_)) => false,
                Ok(None) => true,
                Err(_) => false,
            }
        } else {
            false
        }
    }

    pub fn session_count(&self) -> usize {
        self.instances.lock().unwrap().len()
    }
}
