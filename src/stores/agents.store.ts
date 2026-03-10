import { create } from "zustand";
import type { AgentSession } from "@/types/agent";

interface AgentsState {
  /** All sessions keyed by project ID */
  sessionsByProject: Record<string, AgentSession[]>;
  /** Currently active/focused session ID */
  activeSessionId: string | null;

  setSessions: (projectId: string, sessions: AgentSession[]) => void;
  addSession: (session: AgentSession) => void;
  updateSession: (updated: AgentSession) => void;
  removeSession: (id: string, projectId: string) => void;
  setActiveSession: (id: string | null) => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  sessionsByProject: {},
  activeSessionId: null,

  setSessions: (projectId, sessions) =>
    set((state) => ({
      sessionsByProject: { ...state.sessionsByProject, [projectId]: sessions },
    })),

  addSession: (session) =>
    set((state) => {
      const existing = state.sessionsByProject[session.projectId] ?? [];
      return {
        sessionsByProject: {
          ...state.sessionsByProject,
          [session.projectId]: [...existing, session],
        },
        activeSessionId: session.id,
      };
    }),

  updateSession: (updated) =>
    set((state) => {
      const existing = state.sessionsByProject[updated.projectId] ?? [];
      return {
        sessionsByProject: {
          ...state.sessionsByProject,
          [updated.projectId]: existing.map((s) => (s.id === updated.id ? updated : s)),
        },
      };
    }),

  removeSession: (id, projectId) =>
    set((state) => {
      const existing = state.sessionsByProject[projectId] ?? [];
      return {
        sessionsByProject: {
          ...state.sessionsByProject,
          [projectId]: existing.filter((s) => s.id !== id),
        },
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      };
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),
}));
