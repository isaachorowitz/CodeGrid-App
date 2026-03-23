import { memo, useState, useCallback, useRef } from "react";
import { navigateBrowserPane } from "../lib/ipc";
import { useLayoutStore } from "../stores/layoutStore";
import { useSessionStore } from "../stores/sessionStore";

interface BrowserPaneProps {
  sessionId: string;
  url: string;
  onClose: (sessionId: string) => void;
  onDragStart?: (e: React.MouseEvent) => void;
}

const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";

export const BrowserPane = memo(function BrowserPane({ sessionId, url: initialUrl, onClose, onDragStart }: BrowserPaneProps) {
  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId);
  const setFocusedSession = useSessionStore((s) => s.setFocusedSession);
  const toggleMaximize = useLayoutStore((s) => s.toggleMaximize);
  const minimizePane = useLayoutStore((s) => s.minimizePane);
  const isFocused = focusedSessionId === sessionId;

  const handleNavigate = useCallback(async () => {
    let navUrl = inputUrl.trim();
    if (!navUrl) return;
    if (!navUrl.startsWith("http://") && !navUrl.startsWith("https://")) {
      navUrl = "https://" + navUrl;
    }
    setUrl(navUrl);
    try {
      await navigateBrowserPane(sessionId, navUrl);
    } catch (e) {
      console.error("Navigate failed:", e);
    }
  }, [sessionId, inputUrl]);

  const handleRefresh = useCallback(async () => {
    try {
      await navigateBrowserPane(sessionId, url);
    } catch (e) {
      console.error("Refresh failed:", e);
    }
  }, [sessionId, url]);

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Keep URL typing/button clicks reliable; only drag from empty header space.
    if (target.closest("input, button")) return;
    onDragStart?.(e);
  }, [onDragStart]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0d0d0d",
        border: `1px solid ${isFocused ? "#ff8c00" : "#2a2a2a"}`,
        overflow: "hidden",
      }}
      onClick={() => setFocusedSession(sessionId)}
    >
      {/* Header bar - draggable */}
      <div
        onMouseDown={handleHeaderMouseDown}
        onDoubleClick={() => toggleMaximize(sessionId)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 8px",
          background: "#141414",
          borderBottom: "1px solid #2a2a2a",
          cursor: "grab",
          userSelect: "none",
          fontFamily: MONO,
          fontSize: "11px",
          height: "32px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* Pane type indicator */}
        <span style={{ color: "#4a9eff", fontSize: "12px", marginRight: "4px" }}>&#x229e;</span>

        {/* URL input */}
        <input
          ref={inputRef}
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleNavigate(); }}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Enter URL..."
          style={{
            flex: 1,
            background: "#0a0a0a",
            border: "1px solid #2a2a2a",
            color: "#e0e0e0",
            fontSize: "11px",
            fontFamily: MONO,
            padding: "2px 8px",
            outline: "none",
            borderRadius: "2px",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#ff8c00"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
        />

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          onMouseDown={(e) => e.stopPropagation()}
          title="Refresh"
          style={{
            background: "none", border: "none", color: "#555",
            cursor: "pointer", fontSize: "12px", padding: "2px 4px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ff8c00"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#555"; }}
        >&#x21bb;</button>

        {/* Minimize */}
        <button
          onClick={(e) => { e.stopPropagation(); minimizePane(sessionId); }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Minimize"
          style={{
            background: "none", border: "none", color: "#555",
            cursor: "pointer", fontSize: "10px", padding: "2px 4px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ffab00"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#555"; }}
        >&mdash;</button>

        {/* Close */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(sessionId); }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Close"
          style={{
            background: "none", border: "none", color: "#555",
            cursor: "pointer", fontSize: "12px", padding: "2px 4px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ff3d00"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#555"; }}
        >&times;</button>
      </div>

      {/* Browser content area - this is where the native webview sits underneath */}
      <div style={{ flex: 1, background: "#0a0a0a", position: "relative" }}>
        {/* The native webview renders here — this div is transparent to let it show through */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#333", fontSize: "11px", fontFamily: MONO,
          pointerEvents: "none",
        }}>
          {/* Loading placeholder - hidden once webview renders */}
        </div>
      </div>
    </div>
  );
});
