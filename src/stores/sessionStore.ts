import { create } from "zustand";
import type { SessionInfo } from "../lib/ipc";

interface SessionState {
  sessions: SessionInfo[];
  focusedSessionId: string | null;
  broadcastMode: boolean;

  addSession: (session: SessionInfo) => void;
  removeSession: (sessionId: string) => void;
  updateSession: (sessionId: string, updates: Partial<SessionInfo>) => void;
  setFocusedSession: (sessionId: string | null) => void;
  toggleBroadcast: () => void;
  setSessions: (sessions: SessionInfo[]) => void;
  getSessionByPaneNumber: (paneNumber: number) => SessionInfo | undefined;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  focusedSessionId: null,
  broadcastMode: false,

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      focusedSessionId: session.id,
    })),

  removeSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      focusedSessionId:
        state.focusedSessionId === sessionId
          ? state.sessions.find((s) => s.id !== sessionId)?.id ?? null
          : state.focusedSessionId,
    })),

  updateSession: (sessionId, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, ...updates } : s,
      ),
    })),

  setFocusedSession: (sessionId) => set({ focusedSessionId: sessionId }),

  toggleBroadcast: () =>
    set((state) => ({ broadcastMode: !state.broadcastMode })),

  setSessions: (sessions) => set({ sessions }),

  getSessionByPaneNumber: (paneNumber) =>
    get().sessions.find((s) => s.pane_number === paneNumber),
}));
