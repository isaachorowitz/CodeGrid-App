use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;

#[derive(Deserialize)]
struct RpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    method: String,
    params: Option<serde_json::Value>,
    id: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct RpcResponse {
    jsonrpc: String,
    result: Option<serde_json::Value>,
    error: Option<RpcError>,
    id: serde_json::Value,
}

#[derive(Serialize)]
struct RpcError {
    code: i32,
    message: String,
}

fn socket_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(format!("{home}/.codegrid/socket"))
}

pub async fn start_rpc_server(app_handle: tauri::AppHandle) {
    let path = socket_path();

    // Remove stale socket
    let _ = std::fs::remove_file(&path);

    // Ensure directory exists
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    // Write socket path to a discoverable file
    let socket_path_file = path.parent().unwrap().join("socket-path");
    let _ = std::fs::write(&socket_path_file, path.to_string_lossy().as_bytes());

    let listener = match UnixListener::bind(&path) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[rpc] Failed to bind socket: {e}");
            return;
        }
    };

    println!("[rpc] Listening on {}", path.display());

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let handle = app_handle.clone();
                tokio::spawn(async move {
                    let (reader, mut writer) = stream.into_split();
                    let mut lines = BufReader::new(reader).lines();

                    while let Ok(Some(line)) = lines.next_line().await {
                        let response = handle_request(&handle, &line).await;
                        let json = serde_json::to_string(&response).unwrap_or_default();
                        let _ = writer.write_all(format!("{json}\n").as_bytes()).await;
                    }
                });
            }
            Err(e) => eprintln!("[rpc] Accept error: {e}"),
        }
    }
}

async fn handle_request(app: &tauri::AppHandle, line: &str) -> RpcResponse {
    let req: RpcRequest = match serde_json::from_str(line) {
        Ok(r) => r,
        Err(e) => {
            return RpcResponse {
                jsonrpc: "2.0".into(),
                result: None,
                error: Some(RpcError {
                    code: -32700,
                    message: format!("Parse error: {e}"),
                }),
                id: serde_json::Value::Null,
            }
        }
    };

    let id = req.id.clone().unwrap_or(serde_json::Value::Null);
    let params = req.params.unwrap_or(serde_json::Value::Null);

    let result = match req.method.as_str() {
        "ping" => Ok(serde_json::json!("pong")),

        "open_folder" => {
            let path = params.get("path").and_then(|v| v.as_str());
            match path {
                Some(p) => {
                    use tauri::Emitter;
                    let _ = app.emit("rpc:open-folder", p);
                    Ok(serde_json::json!({"status": "ok", "path": p}))
                }
                None => Err("Missing 'path' parameter"),
            }
        }

        "new_session" => {
            let path = params.get("path").and_then(|v| v.as_str());
            match path {
                Some(p) => {
                    use tauri::Emitter;
                    let _ = app.emit("rpc:new-session", p);
                    Ok(serde_json::json!({"status": "ok", "path": p}))
                }
                None => Err("Missing 'path' parameter"),
            }
        }

        "list_sessions" => {
            use tauri::Emitter;
            let _ = app.emit("rpc:list-sessions", ());
            Ok(serde_json::json!({"status": "ok"}))
        }

        "new_workspace" => {
            let name = params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Workspace");
            use tauri::Emitter;
            let _ = app.emit("rpc:new-workspace", name);
            Ok(serde_json::json!({"status": "ok", "name": name}))
        }

        _ => Err("Method not found"),
    };

    match result {
        Ok(val) => RpcResponse {
            jsonrpc: "2.0".into(),
            result: Some(val),
            error: None,
            id,
        },
        Err(msg) => RpcResponse {
            jsonrpc: "2.0".into(),
            result: None,
            error: Some(RpcError {
                code: -32601,
                message: msg.into(),
            }),
            id,
        },
    }
}

pub fn cleanup() {
    let path = socket_path();
    let _ = std::fs::remove_file(&path);
    let socket_path_file = path.parent().map(|p| p.join("socket-path"));
    if let Some(f) = socket_path_file {
        let _ = std::fs::remove_file(f);
    }
}
