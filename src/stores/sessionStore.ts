import { create } from "zustand";
import type { SessionInfo } from "../lib/ipc";

export interface SessionWithModel extends SessionInfo {
  model?: string;
  /** Dynamically detected terminal activity name (e.g. "Claude", "Git", "zsh") */
  activityName?: string;
  /** Whether the user has manually renamed this tab */
  manualName?: string;
  lastUsedAt: number;
  type?: "terminal" | "browser";
  browserUrl?: string;
}

interface SessionState {
  sessions: SessionWithModel[];
  focusedSessionId: string | null;
  broadcastMode: boolean;

  addSession: (session: SessionInfo) => void;
  removeSession: (sessionId: string) => void;
  updateSession: (sessionId: string, updates: Partial<SessionWithModel>) => void;
  setFocusedSession: (sessionId: string | null) => void;
  toggleBroadcast: () => void;
  setSessions: (sessions: SessionInfo[]) => void;
  setSessionActivityName: (sessionId: string, name: string) => void;
  setSessionManualName: (sessionId: string, name: string) => void;
  setSessionModel: (sessionId: string, model: string) => void;
  getSessionByPaneNumber: (paneNumber: number, workspaceId?: string) => SessionWithModel | undefined;
  touchSession: (sessionId: string) => void;
  getWorkspaceSessionCount: (workspaceId: string) => number;
  removeWorkspaceSessions: (workspaceId: string) => string[];
}

export const MAX_TERMINALS_PER_WORKSPACE = 9;

function hasUpdates<T extends object>(current: T, updates: Partial<T>): boolean {
  for (const key of Object.keys(updates) as (keyof T)[]) {
    const nextValue = updates[key];
    if (nextValue !== undefined && current[key] !== nextValue) {
      return true;
    }
  }
  return false;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  focusedSessionId: null,
  broadcastMode: false,

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, {
        ...session,
        lastUsedAt: Date.now(),
        // Seed manualName from DB-persisted name so restored sessions show their saved name
        manualName: session.name ?? undefined,
      }],
      focusedSessionId: session.id,
    })),

  removeSession: (sessionId) =>
    set((state) => {
      const removed = state.sessions.find((s) => s.id === sessionId);
      const remaining = state.sessions.filter((s) => s.id !== sessionId);
      let nextFocused = state.focusedSessionId;
      if (state.focusedSessionId === sessionId) {
        // Prefer a session in the same workspace, fall back to any remaining
        const sameWorkspace = removed
          ? remaining.find((s) => s.workspace_id === removed.workspace_id)
          : undefined;
        nextFocused = sameWorkspace?.id ?? remaining[0]?.id ?? null;
      }
      return { sessions: remaining, focusedSessionId: nextFocused };
    }),

  updateSession: (sessionId, updates) =>
    set((state) => {
      const index = state.sessions.findIndex((s) => s.id === sessionId);
      if (index < 0) return state;

      const current = state.sessions[index];
      if (!hasUpdates(current, updates)) return state;

      const nextSessions = [...state.sessions];
      nextSessions[index] = { ...current, ...updates };
      return { sessions: nextSessions };
    }),

  setFocusedSession: (sessionId) => {
    set({ focusedSessionId: sessionId });
    if (sessionId) {
      get().touchSession(sessionId);
    }
  },

  toggleBroadcast: () =>
    set((state) => ({ broadcastMode: !state.broadcastMode })),

  setSessions: (sessions) =>
    set({ sessions: sessions.map((s) => ({ ...s, lastUsedAt: Date.now() })) }),

  setSessionActivityName: (sessionId, name) =>
    get().updateSession(sessionId, { activityName: name }),

  setSessionManualName: (sessionId, name) =>
    get().updateSession(sessionId, { manualName: name }),

  setSessionModel: (sessionId, model) =>
    get().updateSession(sessionId, { model }),

  getSessionByPaneNumber: (paneNumber, workspaceId) =>
    get().sessions.find(
      (s) => s.pane_number === paneNumber && (!workspaceId || s.workspace_id === workspaceId),
    ),

  touchSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, lastUsedAt: Date.now() } : s,
      ),
    })),

  getWorkspaceSessionCount: (workspaceId) =>
    get().sessions.filter((s) => s.workspace_id === workspaceId).length,

  removeWorkspaceSessions: (workspaceId) => {
    const removedIds = get().sessions
      .filter((s) => s.workspace_id === workspaceId)
      .map((s) => s.id);
    set((state) => ({
      sessions: state.sessions.filter((s) => s.workspace_id !== workspaceId),
      focusedSessionId:
        state.focusedSessionId && removedIds.includes(state.focusedSessionId)
          ? state.sessions.find(
              (s) => s.workspace_id !== workspaceId,
            )?.id ?? null
          : state.focusedSessionId,
    }));
    return removedIds;
  },
}));
