import { useRef, useEffect, useCallback, memo } from "react";
import { useTerminal } from "../hooks/useTerminal";
import { usePty } from "../hooks/usePty";
import { useSessionStore } from "../stores/sessionStore";
import { updateSessionStatus } from "../lib/ipc";
import { detectActivity } from "../lib/terminalActivity";

// NOTE: Do NOT share a single TextDecoder across components when using
// { stream: true } -- streaming mode keeps internal state for incomplete
// multi-byte sequences, so sharing it between sessions would cause one
// session's partial UTF-8 bytes to corrupt another session's output.

interface TerminalProps {
  sessionId: string;
}

export const TerminalView = memo(function TerminalView({ sessionId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOutputRef = useRef("");
  // Each terminal needs its own TextDecoder because { stream: true } maintains
  // internal state for incomplete multi-byte UTF-8 sequences.
  const textDecoderRef = useRef(new TextDecoder());
  const updateSession = useSessionStore((s) => s.updateSession);
  const setSessionActivityName = useSessionStore((s) => s.setSessionActivityName);
  const broadcastMode = useSessionStore((s) => s.broadcastMode);

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

  const { write, fit, focus } = useTerminal(containerRef, {
    onData: handleData,
    onResize: handleResize,
  });

  const handleOutput = useCallback(
    (data: Uint8Array) => {
      write(data);
      updateSession(sessionId, { status: "running" });

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

      // Reset idle timer
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => {
        updateSession(sessionId, { status: "idle" });
        updateSessionStatus(sessionId, "idle").catch(() => {});
      }, 10000);
    },
    [sessionId, write, updateSession, setSessionActivityName],
  );

  const handleEnded = useCallback(() => {
    updateSession(sessionId, { status: "dead" });
    updateSessionStatus(sessionId, "dead").catch(() => {});
    write("\r\n\x1b[33m[Session ended]\x1b[0m\r\n");
  }, [sessionId, write, updateSession]);

  const ptyControls = usePty({
    sessionId,
    onOutput: handleOutput,
    onEnded: handleEnded,
  });

  // Keep ref in sync
  ptyControlsRef.current = ptyControls;

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    };
  }, []);

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

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      onClick={focus}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    />
  );
});
