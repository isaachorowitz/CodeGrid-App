import { useEffect, useRef, useCallback } from "react";
import { writeToPty, resizePty, connectPty, onPtyOutput, onSessionEnded } from "../lib/ipc";
import type { PtyOutput } from "../lib/ipc";

interface UsePtyOptions {
  sessionId: string;
  onOutput: (data: Uint8Array) => void;
  onEnded: () => void;
}

export function usePty(options: UsePtyOptions) {
  const { sessionId, onOutput, onEnded } = options;
  const unlistenOutputRef = useRef<(() => void) | null>(null);
  const unlistenEndedRef = useRef<(() => void) | null>(null);
  // Use refs to avoid stale closures in event listeners
  const onOutputRef = useRef(onOutput);
  const onEndedRef = useRef(onEnded);
  onOutputRef.current = onOutput;
  onEndedRef.current = onEnded;

  useEffect(() => {
    let mounted = true;

    const setupListeners = async () => {
      unlistenOutputRef.current?.();
      unlistenEndedRef.current?.();

      console.log(`[usePty] Setting up listeners for session ${sessionId}`);

      const unlistenOutput = await onPtyOutput((data: PtyOutput) => {
        if (mounted && data.session_id === sessionId) {
          console.log(`[usePty] Received ${data.data.length} bytes for session ${sessionId}`);
          onOutputRef.current(new Uint8Array(data.data));
        }
      });

      const unlistenEnded = await onSessionEnded((data) => {
        console.log(`[usePty] Session ended event for ${data.session_id}`);
        if (mounted && data.session_id === sessionId) {
          onEndedRef.current();
        }
      });

      if (mounted) {
        unlistenOutputRef.current = unlistenOutput;
        unlistenEndedRef.current = unlistenEnded;
        console.log(`[usePty] Listeners ready, calling connectPty for ${sessionId}`);
        connectPty(sessionId).then(() => {
          console.log(`[usePty] connectPty resolved for ${sessionId}`);
        }).catch((err) => {
          console.error(`[usePty] connectPty failed for ${sessionId}:`, err);
        });
      } else {
        unlistenOutput();
        unlistenEnded();
      }
    };

    setupListeners();

    return () => {
      mounted = false;
      unlistenOutputRef.current?.();
      unlistenEndedRef.current?.();
    };
  }, [sessionId]);

  const write = useCallback(
    (data: string) => {
      const encoder = new TextEncoder();
      writeToPty(sessionId, encoder.encode(data)).catch(console.error);
    },
    [sessionId],
  );

  const resize = useCallback(
    (cols: number, rows: number) => {
      resizePty(sessionId, cols, rows).catch(console.error);
    },
    [sessionId],
  );

  return { write, resize };
}
