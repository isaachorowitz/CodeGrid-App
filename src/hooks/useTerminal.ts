import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { BLOOMBERG_DARK } from "../lib/themes";

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
  // Use refs for callbacks to avoid recreating terminal on callback changes
  const onDataRef = useRef(options.onData);
  const onResizeRef = useRef(options.onResize);
  onDataRef.current = options.onData;
  onResizeRef.current = options.onResize;

  const write = useCallback((data: Uint8Array | string) => {
    terminalRef.current?.write(data);
  }, []);

  const fit = useCallback(() => {
    if (fitAddonRef.current && containerRef.current) {
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
    terminalRef.current?.focus();
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      theme: BLOOMBERG_DARK.terminal,
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
      try {
        fitAddon.fit();
        onResizeRef.current(terminal.cols, terminal.rows);
      } catch {
        // Ignore
      }
    });

    // Handle data input — use ref to avoid stale closure
    const dataDisposable = terminal.onData((data) => onDataRef.current(data));

    // Handle resize
    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        onResizeRef.current(terminal.cols, terminal.rows);
      } catch {
        // Ignore
      }
    });
    observer.observe(container);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      dataDisposable.dispose();
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [containerRef]);

  return { write, fit, focus, clear, terminal: terminalRef };
}
