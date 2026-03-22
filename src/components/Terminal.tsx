import { useRef, useEffect, useCallback, useState, memo } from "react";
import { useTerminal } from "../hooks/useTerminal";
import { usePty } from "../hooks/usePty";
import { useSessionStore } from "../stores/sessionStore";
import { useToastStore } from "../stores/toastStore";
import { updateSessionStatus } from "../lib/ipc";
import { detectActivity, detectAttentionNeeded } from "../lib/terminalActivity";

// NOTE: Do NOT share a single TextDecoder across components when using
// { stream: true } -- streaming mode keeps internal state for incomplete
// multi-byte sequences, so sharing it between sessions would cause one
// session's partial UTF-8 bytes to corrupt another session's output.

interface TerminalProps {
  sessionId: string;
}

type SessionStatus = "idle" | "running" | "waiting" | "error" | "dead";

export const TerminalView = memo(function TerminalView({ sessionId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOutputRef = useRef("");
  const outputBufferRef = useRef<Uint8Array[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<SessionStatus | null>(null);
  const lastAttentionRef = useRef<{ reason: string; at: number } | null>(null);
  const statusToastSentRef = useRef<{ idle: boolean; dead: boolean }>({ idle: false, dead: false });
  // Each terminal needs its own TextDecoder because { stream: true } maintains
  // internal state for incomplete multi-byte UTF-8 sequences.
  const textDecoderRef = useRef(new TextDecoder());
  const updateSession = useSessionStore((s) => s.updateSession);
  const setSessionActivityName = useSessionStore((s) => s.setSessionActivityName);
  const broadcastMode = useSessionStore((s) => s.broadcastMode);
  const addToast = useToastStore((s) => s.addToast);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Use refs to avoid stale closures in callbacks that reference each other
  const ptyControlsRef = useRef<{ write: (data: string) => void; resize: (cols: number, rows: number) => void }>({
    write: () => {},
    resize: () => {},
  });

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      ptyControlsRef.current.resize(cols, rows);
    },
    [],
  );

  const handleData = useCallback(
    (data: string) => {
      if (broadcastMode) {
        window.dispatchEvent(
          new CustomEvent("codegrid:broadcast-input", { detail: { data } }),
        );
      } else {
        ptyControlsRef.current.write(data);
      }
    },
    [broadcastMode],
  );

  const { write, fit, focus, searchAddon } = useTerminal(containerRef, {
    onData: handleData,
    onResize: handleResize,
  });

  const flushOutput = useCallback(() => {
    const chunks = outputBufferRef.current;
    if (chunks.length === 0) return;
    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    outputBufferRef.current = [];
    write(merged);
  }, [write]);

  const setSessionStatus = useCallback(
    (status: SessionStatus) => {
      if (statusRef.current === status) return;
      statusRef.current = status;
      updateSession(sessionId, { status });
    },
    [sessionId, updateSession],
  );

  const handleOutput = useCallback(
    (data: Uint8Array) => {
      outputBufferRef.current.push(data);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flushOutput, 5);
      setSessionStatus("running");

      // Accumulate output for activity detection (debounced to avoid excessive processing)
      const text = textDecoderRef.current.decode(data, { stream: true });
      pendingOutputRef.current += text;
      // Keep only the last 2000 chars to avoid unbounded growth
      if (pendingOutputRef.current.length > 2000) {
        pendingOutputRef.current = pendingOutputRef.current.slice(-2000);
      }

      // Debounce activity detection: wait 300ms after last output chunk
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      activityTimerRef.current = setTimeout(() => {
        const detected = detectActivity(pendingOutputRef.current);
        if (detected) {
          setSessionActivityName(sessionId, detected);
        }
        // Clear accumulated output after processing
        pendingOutputRef.current = "";
      }, 300);

      // Surface immediate "needs attention" prompts across terminals.
      const attention = detectAttentionNeeded(pendingOutputRef.current);
      if (attention) {
        const now = Date.now();
        const last = lastAttentionRef.current;
        const isDuplicate = !!last && last.reason === attention && now - last.at < 15000;
        if (!isDuplicate) {
          lastAttentionRef.current = { reason: attention, at: now };
          window.dispatchEvent(
            new CustomEvent("codegrid:session-attention", {
              detail: { sessionId, reason: attention },
            }),
          );
        }
      }

      // Reset idle timer
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => {
        setSessionStatus("idle");
        updateSessionStatus(sessionId, "idle").catch((err) => {
          if (!statusToastSentRef.current.idle) {
            statusToastSentRef.current.idle = true;
            addToast(`Could not sync idle status for terminal ${sessionId.slice(0, 6)}: ${err}`, "warning", 5000);
          }
        });
      }, 10000);
    },
    [sessionId, write, flushOutput, setSessionStatus, setSessionActivityName, addToast],
  );

  const handleEnded = useCallback(() => {
    setSessionStatus("dead");
    updateSessionStatus(sessionId, "dead").catch((err) => {
      if (!statusToastSentRef.current.dead) {
        statusToastSentRef.current.dead = true;
        addToast(`Could not sync ended status for terminal ${sessionId.slice(0, 6)}: ${err}`, "warning", 5000);
      }
    });
    write("\r\n\x1b[33m[Session ended]\x1b[0m\r\n");
  }, [sessionId, write, setSessionStatus, addToast]);

  const ptyControls = usePty({
    sessionId,
    onOutput: handleOutput,
    onEnded: handleEnded,
  });

  // Keep ref in sync
  ptyControlsRef.current = ptyControls;

  // Clean up timers on unmount — flush remaining buffered output first
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      // Drain any buffered output before terminal disposes
      const chunks = outputBufferRef.current;
      if (chunks.length > 0) {
        const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
        outputBufferRef.current = [];
        write(merged);
      }
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    };
  }, [write]);

  // Listen for focus events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.sessionId === sessionId) {
        focus();
      }
    };
    window.addEventListener("codegrid:focus-terminal", handler);
    return () => window.removeEventListener("codegrid:focus-terminal", handler);
  }, [sessionId, focus]);

  // Listen for broadcast write -- use ref to avoid stale closure
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ sessionId?: string; data?: string }>).detail;
      if (!detail || detail.sessionId !== sessionId || typeof detail.data !== "string") return;
      ptyControlsRef.current.write(detail.data);
    };
    window.addEventListener("codegrid:broadcast-write", handler);
    return () => window.removeEventListener("codegrid:broadcast-write", handler);
  }, [sessionId]);

  // Fit on mount
  useEffect(() => {
    const timer = setTimeout(fit, 100);
    return () => clearTimeout(timer);
  }, [fit]);

  // Re-fit when workspace switches back to this terminal's workspace
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ workspaceId?: string }>).detail;
      const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId);
      if (session && detail?.workspaceId === session.workspace_id) {
        // Small delay to let CSS visibility change take effect before fitting
        setTimeout(fit, 50);
      }
    };
    window.addEventListener("codegrid:workspace-changed", handler);
    return () => window.removeEventListener("codegrid:workspace-changed", handler);
  }, [sessionId, fit]);

  const handleSearchNext = useCallback(() => {
    if (searchAddon.current && searchTerm) {
      searchAddon.current.findNext(searchTerm);
    }
  }, [searchTerm, searchAddon]);

  const handleSearchPrev = useCallback(() => {
    if (searchAddon.current && searchTerm) {
      searchAddon.current.findPrevious(searchTerm);
    }
  }, [searchTerm, searchAddon]);

  // Auto-search on term change
  useEffect(() => {
    if (searchAddon.current && searchTerm) {
      searchAddon.current.findNext(searchTerm);
    }
  }, [searchTerm, searchAddon]);

  // Intercept Cmd+F / Ctrl+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    };
    const el = containerRef.current;
    if (el) {
      el.addEventListener("keydown", handler, true);
      return () => el.removeEventListener("keydown", handler, true);
    }
  }, [containerRef]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      onClick={focus}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {searchOpen && (
        <div style={{
          position: "absolute", top: 4, right: 16, zIndex: 10,
          display: "flex", gap: "4px", alignItems: "center",
          background: "#1e1e1e", border: "1px solid #ff8c00",
          padding: "4px 8px",
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
        }}>
          <input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.shiftKey ? handleSearchPrev() : handleSearchNext();
              }
              if (e.key === "Escape") {
                setSearchOpen(false);
                setSearchTerm("");
                searchAddon.current?.clearDecorations();
                focus();
              }
            }}
            placeholder="Find..."
            style={{
              background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0",
              fontSize: "11px", padding: "3px 6px", outline: "none", width: "160px",
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            }}
          />
          <button onClick={handleSearchPrev} style={{
            background: "none", border: "1px solid #2a2a2a", color: "#888", fontSize: "10px",
            cursor: "pointer", padding: "2px 6px", fontFamily: "monospace",
          }}>↑</button>
          <button onClick={handleSearchNext} style={{
            background: "none", border: "1px solid #2a2a2a", color: "#888", fontSize: "10px",
            cursor: "pointer", padding: "2px 6px", fontFamily: "monospace",
          }}>↓</button>
          <button onClick={() => {
            setSearchOpen(false);
            setSearchTerm("");
            searchAddon.current?.clearDecorations();
            focus();
          }} style={{
            background: "none", border: "none", color: "#555", fontSize: "12px",
            cursor: "pointer", padding: "0 4px", fontFamily: "monospace",
          }}>×</button>
        </div>
      )}
    </div>
  );
});
