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
  const lastOutputTime = useRef<number>(Date.now());
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateSession = useSessionStore((s) => s.updateSession);
  const broadcastMode = useSessionStore((s) => s.broadcastMode);

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      ptyControls.resize(cols, rows);
    },
    [sessionId],
  );

  const handleData = useCallback(
    (data: string) => {
      if (broadcastMode) {
        // When broadcasting, the App component handles routing
        window.dispatchEvent(
          new CustomEvent("gridcode:broadcast-input", { detail: { data } }),
        );
      } else {
        ptyControls.write(data);
      }
    },
    [sessionId, broadcastMode],
  );

  const { write, fit, focus, terminal } = useTerminal(containerRef, {
    onData: handleData,
    onResize: handleResize,
  });

  const handleOutput = useCallback(
    (data: Uint8Array) => {
      write(data);
      lastOutputTime.current = Date.now();
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

  // Listen for broadcast input
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      ptyControls.write(detail.data);
    };
    window.addEventListener("gridcode:broadcast-write", handler);
    return () => window.removeEventListener("gridcode:broadcast-write", handler);
  }, [ptyControls.write]);

  // Fit on container visibility change
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
