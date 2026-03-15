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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const write = useCallback((data: Uint8Array | string) => {
    terminalRef.current?.write(data);
  }, []);

  const fit = useCallback(() => {
    if (fitAddonRef.current && containerRef.current) {
      try {
        fitAddonRef.current.fit();
        const term = terminalRef.current;
        if (term) {
          options.onResize(term.cols, term.rows);
        }
      } catch {
        // Ignore fit errors during transitions
      }
    }
  }, [containerRef, options.onResize]);

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
      fontFamily: options.fontFamily ?? "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
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
      console.warn("WebGL renderer not available, using canvas");
    }

    // Fit to container
    setTimeout(() => {
      fitAddon.fit();
      options.onResize(terminal.cols, terminal.rows);
    }, 0);

    // Handle data input
    terminal.onData(options.onData);

    // Handle resize
    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        options.onResize(terminal.cols, terminal.rows);
      } catch {
        // Ignore
      }
    });
    observer.observe(container);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    resizeObserverRef.current = observer;

    return () => {
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      resizeObserverRef.current = null;
    };
  }, [containerRef]);

  return { write, fit, focus, clear, terminal: terminalRef };
}
