import { useCallback, useMemo, memo } from "react";
import GridLayout from "react-grid-layout";
import { Pane } from "./Pane";
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

  const rowHeight = useMemo(() => {
    // 12 rows to fill the height, minus some margin
    return Math.floor((height - 40) / 12);
  }, [height]);

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      if (!maximizedPane) {
        setLayouts(newLayout);
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

  return (
    <GridLayout
      className="gridcode-layout"
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
  );
});
