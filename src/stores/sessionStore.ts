import { create } from "zustand";
import type { SessionInfo } from "../lib/ipc";

export interface SessionWithModel extends SessionInfo {
  model?: string;
}

interface SessionState {
  sessions: SessionWithModel[];
  focusedSessionId: string | null;
  broadcastMode: boolean;

  addSession: (session: SessionInfo, model?: string) => void;
  removeSession: (sessionId: string) => void;
  updateSession: (sessionId: string, updates: Partial<SessionWithModel>) => void;
  setFocusedSession: (sessionId: string | null) => void;
  toggleBroadcast: () => void;
  setSessions: (sessions: SessionInfo[]) => void;
  setSessionModel: (sessionId: string, model: string) => void;
  getSessionByPaneNumber: (paneNumber: number) => SessionWithModel | undefined;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  focusedSessionId: null,
  broadcastMode: false,

  addSession: (session, model) =>
    set((state) => ({
      sessions: [...state.sessions, { ...session, model: model ?? "claude-sonnet-4-6" }],
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

  setSessions: (sessions) =>
    set({ sessions: sessions.map((s) => ({ ...s, model: "claude-sonnet-4-6" })) }),

  setSessionModel: (sessionId, model) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, model } : s,
      ),
    })),

  getSessionByPaneNumber: (paneNumber) =>
    get().sessions.find((s) => s.pane_number === paneNumber),
}));
