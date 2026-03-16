import { useEffect, useRef, useCallback } from "react";
import { writeToPty, resizePty, connectPty, onPtyOutput, onSessionEnded } from "../lib/ipc";
import type { PtyOutput } from "../lib/ipc";

interface UsePtyOptions {
  sessionId: string;
  onOutput: (data: Uint8Array) => void;
  onEnded: () => void;
}

// Reuse a single TextEncoder instance across all usePty hooks
const textEncoder = new TextEncoder();

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
      // Clean up any previous listeners before setting up new ones
      unlistenOutputRef.current?.();
      unlistenOutputRef.current = null;
      unlistenEndedRef.current?.();
      unlistenEndedRef.current = null;

      const unlistenOutput = await onPtyOutput((data: PtyOutput) => {
        if (mounted && data.session_id === sessionId) {
          onOutputRef.current(new Uint8Array(data.data));
        }
      });

      const unlistenEnded = await onSessionEnded((data) => {
        if (mounted && data.session_id === sessionId) {
          onEndedRef.current();
        }
      });

      if (mounted) {
        unlistenOutputRef.current = unlistenOutput;
        unlistenEndedRef.current = unlistenEnded;
        // Signal the backend that listeners are ready so it can flush buffered output
        connectPty(sessionId).catch((err) => {
          console.error(`[usePty] connectPty failed for ${sessionId}:`, err);
        });
      } else {
        // Component unmounted during async setup -- clean up immediately
        unlistenOutput();
        unlistenEnded();
      }
    };

    setupListeners();

    return () => {
      mounted = false;
      unlistenOutputRef.current?.();
      unlistenOutputRef.current = null;
      unlistenEndedRef.current?.();
      unlistenEndedRef.current = null;
    };
  }, [sessionId]);

  const write = useCallback(
    (data: string) => {
      writeToPty(sessionId, textEncoder.encode(data)).catch(console.error);
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
