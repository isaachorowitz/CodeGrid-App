import { useEffect, useRef, useCallback } from "react";
import { writeToPty, resizePty, onPtyOutput, onSessionEnded } from "../lib/ipc";
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

  useEffect(() => {
    let mounted = true;

    const setupListeners = async () => {
      unlistenOutputRef.current?.();
      unlistenEndedRef.current?.();

      const unlistenOutput = await onPtyOutput((data: PtyOutput) => {
        if (mounted && data.session_id === sessionId) {
          onOutput(new Uint8Array(data.data));
        }
      });

      const unlistenEnded = await onSessionEnded((data) => {
        if (mounted && data.session_id === sessionId) {
          onEnded();
        }
      });

      if (mounted) {
        unlistenOutputRef.current = unlistenOutput;
        unlistenEndedRef.current = unlistenEnded;
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
