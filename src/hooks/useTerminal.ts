import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { CODEGRID_DARK } from "../lib/themes";

interface UseTerminalOptions {
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  fontSize?: number;
  fontFamily?: string;
}

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseTerminalOptions,
) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const disposedRef = useRef(false);
  // Use refs for callbacks to avoid recreating terminal on callback changes
  const onDataRef = useRef(options.onData);
  const onResizeRef = useRef(options.onResize);
  onDataRef.current = options.onData;
  onResizeRef.current = options.onResize;

  const write = useCallback((data: Uint8Array | string) => {
    if (!disposedRef.current) {
      terminalRef.current?.write(data);
    }
  }, []);

  const fit = useCallback(() => {
    if (!disposedRef.current && fitAddonRef.current && containerRef.current) {
      try {
        fitAddonRef.current.fit();
        const term = terminalRef.current;
        if (term) {
          onResizeRef.current(term.cols, term.rows);
        }
      } catch {
        // Ignore fit errors during transitions
      }
    }
  }, [containerRef]);

  const focus = useCallback(() => {
    if (!disposedRef.current) {
      terminalRef.current?.focus();
    }
  }, []);

  const clear = useCallback(() => {
    if (!disposedRef.current) {
      terminalRef.current?.clear();
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    disposedRef.current = false;

    const terminal = new Terminal({
      theme: CODEGRID_DARK.terminal,
      fontSize: options.fontSize ?? 13,
      fontFamily: options.fontFamily ?? "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 10000,
      allowProposedApi: true,
      convertEol: true,
      macOptionIsMeta: true,
      macOptionClickForcesSelection: true,
      drawBoldTextInBrightColors: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(container);

    // Try WebGL renderer, fall back to canvas
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available, canvas fallback is fine
    }

    // Fit to container
    requestAnimationFrame(() => {
      if (!disposedRef.current) {
        try {
          fitAddon.fit();
          onResizeRef.current(terminal.cols, terminal.rows);
        } catch {
          // Ignore
        }
      }
    });

    // Handle data input -- use ref to avoid stale closure
    const dataDisposable = terminal.onData((data) => onDataRef.current(data));

    // Handle resize with debouncing to avoid thrashing during layout transitions.
    // Without debouncing, rapid resize events (e.g. dragging a grid splitter)
    // cause excessive fit() calls which can visually glitch and flood the PTY
    // with SIGWINCH-equivalent resize sequences.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!disposedRef.current) {
          try {
            fitAddon.fit();
            onResizeRef.current(terminal.cols, terminal.rows);
          } catch {
            // Ignore
          }
        }
      }, 50);
    });
    observer.observe(container);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      disposedRef.current = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      dataDisposable.dispose();
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [containerRef]);

  return { write, fit, focus, clear, terminal: terminalRef };
}
