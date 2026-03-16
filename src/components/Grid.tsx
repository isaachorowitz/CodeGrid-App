import { useCallback, useMemo, memo } from "react";
import GridLayout from "react-grid-layout";
import { Pane } from "./Pane";
import { MinimizedPaneBar } from "./MinimizedPaneBar";
import { useSessionStore } from "../stores/sessionStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { Layout } from "react-grid-layout";

import "react-grid-layout/css/styles.css";

interface GridProps {
  width: number;
  height: number;
  onCloseSession: (sessionId: string) => void;
}

/** Clamp layout items so nothing goes past 12-col / 12-row boundaries */
function clampLayouts(layouts: Layout[]): Layout[] {
  return layouts.map((l) => {
    const w = Math.max(l.w, l.minW ?? 2);
    const h = Math.max(l.h, l.minH ?? 2);
    const x = Math.max(0, Math.min(l.x, 12 - w));
    const y = Math.max(0, Math.min(l.y, 12 - h));
    return { ...l, x, y, w, h };
  });
}

export const Grid = memo(function Grid({ width, height, onCloseSession }: GridProps) {
  const allSessions = useSessionStore((s) => s.sessions);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const sessions = useMemo(
    () => allSessions.filter((s) => s.workspace_id === activeWorkspaceId),
    [allSessions, activeWorkspaceId],
  );
  const layouts = useLayoutStore((s) => s.layouts);
  const maximizedPane = useLayoutStore((s) => s.maximizedPane);
  const setLayouts = useLayoutStore((s) => s.setLayouts);
  const minimizedPanes = useLayoutStore((s) => s.minimizedPanes);

  // Reserve space for minimized pane bar at bottom (32px when panes are minimized)
  const hasMinimized = Object.keys(minimizedPanes).length > 0;
  const minimizedBarHeight = hasMinimized ? 34 : 0;
  const gridAreaHeight = height - minimizedBarHeight;

  const rowHeight = useMemo(() => {
    // 12 rows to fill the height, minus some margin
    return Math.floor((gridAreaHeight - 40) / 12);
  }, [gridAreaHeight]);

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      if (!maximizedPane) {
        // Clamp all positions to stay within the viewport
        setLayouts(clampLayouts(newLayout));
      }
    },
    [setLayouts, maximizedPane],
  );

  const visibleLayouts = useMemo(() => {
    if (maximizedPane) {
      return layouts.filter((l) => l.i === maximizedPane);
    }
    return layouts;
  }, [layouts, maximizedPane]);

  const visibleSessions = useMemo(() => {
    const layoutIds = new Set(visibleLayouts.map((l) => l.i));
    return sessions.filter((s) => layoutIds.has(s.id));
  }, [sessions, visibleLayouts]);

  // Minimized sessions
  const minimizedSessions = useMemo(() => {
    const minIds = new Set(Object.keys(minimizedPanes));
    return sessions.filter((s) => minIds.has(s.id));
  }, [sessions, minimizedPanes]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Dot grid background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: gridAreaHeight,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage:
            "radial-gradient(circle, #222222 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          backgroundPosition: "12px 12px",
        }}
      />

      {/* Grid area */}
      <div style={{ position: "relative", zIndex: 1, height: gridAreaHeight }}>
        <GridLayout
          className="codegrid-layout"
          layout={visibleLayouts}
          cols={12}
          rowHeight={rowHeight}
          width={width}
          margin={[1, 1]}
          containerPadding={[0, 0]}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle"
          compactType={null}
          preventCollision={false}
          isResizable={!maximizedPane}
          isDraggable={!maximizedPane}
          useCSSTransforms={true}
        >
          {visibleSessions.map((session) => (
            <div key={session.id} style={{ overflow: "hidden" }}>
              <Pane session={session} onClose={onCloseSession} />
            </div>
          ))}
        </GridLayout>
      </div>

      {/* Minimized panes dock at bottom */}
      {minimizedSessions.length > 0 && (
        <MinimizedPaneBar
          sessions={minimizedSessions}
          onCloseSession={onCloseSession}
        />
      )}
    </div>
  );
});
