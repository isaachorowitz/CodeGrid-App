import { useRef, useEffect, useCallback, memo } from "react";
import { useTerminal } from "../hooks/useTerminal";
import { usePty } from "../hooks/usePty";
import { useSessionStore } from "../stores/sessionStore";
import { updateSessionStatus } from "../lib/ipc";

interface TerminalProps {
  sessionId: string;
}

export const TerminalView = memo(function TerminalView({ sessionId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateSession = useSessionStore((s) => s.updateSession);
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
          new CustomEvent("gridcode:broadcast-input", { detail: { data } }),
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

      // Reset idle timer
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => {
        updateSession(sessionId, { status: "idle" });
        updateSessionStatus(sessionId, "idle").catch(() => {});
      }, 10000);
    },
    [sessionId, write, updateSession],
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

  // Clean up idle timer on unmount
  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
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
    window.addEventListener("gridcode:focus-terminal", handler);
    return () => window.removeEventListener("gridcode:focus-terminal", handler);
  }, [sessionId, focus]);

  // Listen for broadcast write — use ref to avoid stale closure
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      ptyControlsRef.current.write(detail.data);
    };
    window.addEventListener("gridcode:broadcast-write", handler);
    return () => window.removeEventListener("gridcode:broadcast-write", handler);
  }, []);

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
