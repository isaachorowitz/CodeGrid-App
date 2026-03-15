import { useEffect, useCallback } from "react";
import { matchKeybinding } from "../lib/keybindings";
import { useSessionStore } from "../stores/sessionStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

export function useKeyboardNav() {
  const {
    sessions,
    focusedSessionId,
    setFocusedSession,
    toggleBroadcast,
  } = useSessionStore();
  const { layouts, toggleMaximize, swapPanes } = useLayoutStore();
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    setCommandPaletteOpen,
    setNewSessionDialogOpen,
    toggleSidebar,
    setSettingsOpen,
  } = useWorkspaceStore();

  const findAdjacentPane = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      if (!focusedSessionId) return null;
      const current = layouts.find((l) => l.i === focusedSessionId);
      if (!current) return null;

      const candidates = layouts.filter((l) => l.i !== focusedSessionId);
      let best: (typeof layouts)[0] | null = null;
      let bestDist = Infinity;

      for (const c of candidates) {
        let isInDirection = false;
        let dist = Infinity;

        switch (direction) {
          case "up":
            isInDirection = c.y < current.y;
            dist = current.y - c.y + Math.abs(c.x - current.x) * 0.1;
            break;
          case "down":
            isInDirection = c.y > current.y;
            dist = c.y - current.y + Math.abs(c.x - current.x) * 0.1;
            break;
          case "left":
            isInDirection = c.x < current.x;
            dist = current.x - c.x + Math.abs(c.y - current.y) * 0.1;
            break;
          case "right":
            isInDirection = c.x > current.x;
            dist = c.x - current.x + Math.abs(c.y - current.y) * 0.1;
            break;
        }

        if (isInDirection && dist < bestDist) {
          best = c;
          bestDist = dist;
        }
      }

      return best?.i ?? null;
    },
    [focusedSessionId, layouts],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const action = matchKeybinding(e);
      if (!action) return;

      // Don't intercept when typing in an input/dialog
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        if (action !== "command-palette") return;
      }

      e.preventDefault();
      e.stopPropagation();

      switch (action) {
        case "new-session":
          setNewSessionDialogOpen(true);
          break;
        case "close-session":
          // Handled by the pane component
          if (focusedSessionId) {
            window.dispatchEvent(
              new CustomEvent("gridcode:close-session", {
                detail: { sessionId: focusedSessionId },
              }),
            );
          }
          break;
        case "focus-up":
        case "focus-down":
        case "focus-left":
        case "focus-right": {
          const dir = action.replace("focus-", "") as "up" | "down" | "left" | "right";
          const targetId = findAdjacentPane(dir);
          if (targetId) {
            setFocusedSession(targetId);
            window.dispatchEvent(
              new CustomEvent("gridcode:focus-terminal", {
                detail: { sessionId: targetId },
              }),
            );
          }
          break;
        }
        case "swap-up":
        case "swap-down":
        case "swap-left":
        case "swap-right": {
          const dir = action.replace("swap-", "") as "up" | "down" | "left" | "right";
          const targetId = findAdjacentPane(dir);
          if (targetId && focusedSessionId) {
            swapPanes(focusedSessionId, targetId);
          }
          break;
        }
        case "maximize-pane":
          if (focusedSessionId) {
            toggleMaximize(focusedSessionId);
          }
          break;
        case "command-palette":
          setCommandPaletteOpen(true);
          break;
        case "toggle-broadcast":
          toggleBroadcast();
          break;
        case "toggle-sidebar":
          toggleSidebar();
          break;
        case "settings":
          setSettingsOpen(true);
          break;
        case "new-workspace":
          window.dispatchEvent(new CustomEvent("gridcode:new-workspace"));
          break;
        case "next-workspace":
        case "prev-workspace": {
          const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
          if (idx >= 0) {
            const next =
              action === "next-workspace"
                ? (idx + 1) % workspaces.length
                : (idx - 1 + workspaces.length) % workspaces.length;
            setActiveWorkspace(workspaces[next].id);
          }
          break;
        }
        default:
          // Handle focus-pane-N
          if (action.startsWith("focus-pane-")) {
            const num = parseInt(action.replace("focus-pane-", ""), 10);
            const session = sessions.find((s) => s.pane_number === num);
            if (session) {
              setFocusedSession(session.id);
              window.dispatchEvent(
                new CustomEvent("gridcode:focus-terminal", {
                  detail: { sessionId: session.id },
                }),
              );
            }
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusedSessionId,
    sessions,
    workspaces,
    activeWorkspaceId,
    findAdjacentPane,
  ]);
}
