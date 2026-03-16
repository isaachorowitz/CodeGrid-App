import { memo, useState, useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../stores/appStore";
import {
  listMcps, addMcpServer, removeMcpServer, toggleMcpServer,
  getHomeDir, type McpServerConfig,
} from "../lib/ipc";

export const McpManager = memo(function McpManager() {
  const { mcpManagerOpen, setMcpManagerOpen, mcpManagerDir } = useAppStore();
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [filter, setFilter] = useState<"all" | "global" | "project">("all");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [newArgs, setNewArgs] = useState("");
  const [newScope, setNewScope] = useState<"global" | "project">("global");

  const dir = mcpManagerDir ?? undefined;
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await listMcps(dir);
      setServers(list);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [dir]);

  useEffect(() => {
    if (mcpManagerOpen) refresh();
  }, [mcpManagerOpen, refresh]);

  const flash = (msg: string) => {
    setSuccess(msg);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setSuccess(null), 2000);
  };

  const handleToggle = useCallback(async (srv: McpServerConfig) => {
    try {
      await toggleMcpServer(srv.source_file, srv.name, !srv.enabled);
      flash(`${srv.name} ${srv.enabled ? "disabled" : "enabled"}`);
      await refresh();
    } catch (e) { setError(String(e)); }
  }, [refresh]);

  const handleRemove = useCallback(async (srv: McpServerConfig) => {
    try {
      await removeMcpServer(srv.source_file, srv.name);
      flash(`Removed ${srv.name}`);
      await refresh();
    } catch (e) { setError(String(e)); }
  }, [refresh]);

  const handleAdd = useCallback(async () => {
    if (!newName.trim() || !newCommand.trim()) return;
    let homePath = "~";
    try { homePath = await getHomeDir(); } catch {}
    const configPath = newScope === "project" && dir
      ? `${dir}/.claude/mcp.json`
      : `${homePath}/.claude/mcp.json`;
    try {
      const args = newArgs.trim() ? newArgs.trim().split(/\s+/) : [];
      await addMcpServer(configPath, newName.trim(), newCommand.trim(), args, {});
      flash(`Added ${newName.trim()}`);
      setNewName(""); setNewCommand(""); setNewArgs(""); setAdding(false);
      await refresh();
    } catch (e) { setError(String(e)); }
  }, [newName, newCommand, newArgs, newScope, dir, refresh]);

  if (!mcpManagerOpen) return null;

  const filtered = filter === "all" ? servers
    : servers.filter((s) => filter === "global" ? s.scope === "global" : s.scope === "project");

  const globalCount = servers.filter((s) => s.scope === "global").length;
  const projectCount = servers.filter((s) => s.scope === "project").length;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", justifyContent: "center", paddingTop: "40px" }}
      onClick={() => setMcpManagerOpen(false)}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="MCP Server Manager"
        style={{
          position: "relative", width: "620px", maxHeight: "600px", background: "#141414",
          border: "1px solid #d500f9", fontFamily: "'SF Mono', 'Menlo', monospace", zIndex: 1,
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a2a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "#d500f9", fontSize: "12px", fontWeight: "bold", letterSpacing: "1px" }}>
              MCP SERVERS
            </div>
            <div style={{ color: "#555555", fontSize: "10px", marginTop: "2px" }}>
              {servers.length} server{servers.length !== 1 ? "s" : ""} configured
              {dir && (
                <span style={{ marginLeft: "8px" }}>
                  — {dir.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~")}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <button onClick={() => setAdding(!adding)} style={{
              background: adding ? "#d500f9" : "#1e1e1e", border: "1px solid #d500f9",
              color: adding ? "#0a0a0a" : "#d500f9", fontSize: "10px", fontFamily: "'SF Mono', monospace",
              cursor: "pointer", padding: "4px 10px", fontWeight: "bold",
            }}>
              {adding ? "CANCEL" : "+ ADD"}
            </button>
            <button onClick={() => setMcpManagerOpen(false)} style={{
              background: "none", border: "none", color: "#555555", fontSize: "14px", cursor: "pointer",
              fontFamily: "'SF Mono', monospace", marginLeft: "8px",
            }}>x</button>
          </div>
        </div>

        {/* Feedback */}
        {error && <div style={{ padding: "6px 16px", background: "#ff3d0022", color: "#ff3d00", fontSize: "10px" }}>{error}</div>}
        {success && <div style={{ padding: "6px 16px", background: "#00c85322", color: "#00c853", fontSize: "10px" }}>{success}</div>}

        {/* Add form */}
        {adding && (
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #2a2a2a", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Server name"
                style={{ flex: 1, background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "11px", fontFamily: "'SF Mono', monospace", padding: "6px 8px", outline: "none" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#d500f9")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
              />
              <select value={newScope} onChange={(e) => setNewScope(e.target.value as "global" | "project")}
                style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "11px", fontFamily: "'SF Mono', monospace", padding: "4px 8px" }}>
                <option value="global">Global</option>
                {dir && <option value="project">Project</option>}
              </select>
            </div>
            <input value={newCommand} onChange={(e) => setNewCommand(e.target.value)} placeholder="Command (e.g. npx, uvx, docker)"
              style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "11px", fontFamily: "'SF Mono', monospace", padding: "6px 8px", outline: "none" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#d500f9")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
            />
            <input value={newArgs} onChange={(e) => setNewArgs(e.target.value)} placeholder="Arguments (space-separated)"
              style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "11px", fontFamily: "'SF Mono', monospace", padding: "6px 8px", outline: "none" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#d500f9")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
            <button onClick={handleAdd} disabled={!newName.trim() || !newCommand.trim()} style={{
              background: newName.trim() && newCommand.trim() ? "#d500f9" : "#2a2a2a", border: "none",
              color: newName.trim() && newCommand.trim() ? "#0a0a0a" : "#555555", fontSize: "10px",
              fontFamily: "'SF Mono', monospace", cursor: newName.trim() && newCommand.trim() ? "pointer" : "default",
              padding: "6px 12px", fontWeight: "bold", alignSelf: "flex-end",
            }}>ADD SERVER</button>
          </div>
        )}

        {/* Scope filter tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a" }}>
          {([
            { id: "all" as const, label: "All", count: servers.length },
            { id: "global" as const, label: "Global", count: globalCount },
            { id: "project" as const, label: "Project", count: projectCount },
          ]).map((t) => (
            <button key={t.id} onClick={() => setFilter(t.id)} style={{
              flex: 1, padding: "8px", background: filter === t.id ? "#1e1e1e" : "transparent",
              border: "none", borderBottom: filter === t.id ? "2px solid #d500f9" : "2px solid transparent",
              color: filter === t.id ? "#d500f9" : "#555555", fontSize: "10px", fontFamily: "'SF Mono', monospace",
              cursor: "pointer", letterSpacing: "0.5px",
            }}>
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* Server list */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#555555", fontSize: "11px" }}>
              No MCP servers configured
              {filter !== "all" && " in this scope"}
            </div>
          ) : (
            filtered.map((srv) => (
              <div
                key={`${srv.scope}-${srv.name}`}
                style={{
                  display: "flex", alignItems: "center", padding: "8px 16px", gap: "10px",
                  borderBottom: "1px solid #1e1e1e", opacity: srv.enabled ? 1 : 0.5,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {/* Toggle */}
                <button onClick={() => handleToggle(srv)} role="switch" aria-checked={srv.enabled}
                  aria-label={`Toggle ${srv.name}`} style={{
                  width: "28px", height: "14px", borderRadius: "7px", border: "none", cursor: "pointer",
                  background: srv.enabled ? "#d500f9" : "#2a2a2a", position: "relative", flexShrink: 0,
                }}>
                  <div style={{
                    width: "10px", height: "10px", borderRadius: "50%", background: "#e0e0e0",
                    position: "absolute", top: "2px", transition: "left 0.15s",
                    left: srv.enabled ? "16px" : "2px",
                  }} />
                </button>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "#e0e0e0", fontSize: "11px", fontWeight: "bold" }}>{srv.name}</span>
                    <span style={{
                      fontSize: "8px", fontWeight: "bold", letterSpacing: "0.5px", padding: "1px 4px",
                      border: `1px solid ${srv.scope === "global" ? "#4a9eff66" : "#00c85366"}`,
                      color: srv.scope === "global" ? "#4a9eff" : "#00c853",
                    }}>{srv.scope.toUpperCase()}</span>
                  </div>
                  <div style={{ color: "#555555", fontSize: "10px", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {srv.command} {srv.args.join(" ")}
                  </div>
                </div>

                {/* Remove */}
                <button onClick={() => handleRemove(srv)} style={{
                  background: "none", border: "1px solid #ff3d0044", color: "#ff3d00", fontSize: "8px",
                  fontFamily: "'SF Mono', monospace", cursor: "pointer", padding: "2px 6px", flexShrink: 0,
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#ff3d00")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#ff3d0044")}
                >REMOVE</button>
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div style={{ padding: "8px 16px", borderTop: "1px solid #2a2a2a", color: "#333333", fontSize: "9px" }}>
          Global: ~/.claude/mcp.json  {dir ? `| Project: ${dir.split("/").pop()}/.claude/mcp.json` : ""}
        </div>
      </div>
    </div>
  );
});
