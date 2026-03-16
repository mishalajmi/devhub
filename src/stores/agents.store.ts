import { create } from "zustand";
import type { AgentSession, AgentMessage, OpenCodeInstance } from "@devhub/types";

interface AgentsState {
  /** All sessions keyed by project ID */
  sessionsByProject: Record<string, AgentSession[]>;
  /** Currently active/focused session ID */
  activeSessionId: string | null;
  /** Streamed messages keyed by session ID */
  messagesBySession: Record<string, AgentMessage[]>;
  /** Discovered OpenCode instances keyed by project ID */
  instancesByProject: Record<string, OpenCodeInstance[]>;

  setSessions: (projectId: string, sessions: AgentSession[]) => void;
  addSession: (session: AgentSession) => void;
  updateSession: (updated: AgentSession) => void;
  removeSession: (id: string, projectId: string) => void;
  setActiveSession: (id: string | null) => void;
  addMessage: (sessionId: string, msg: AgentMessage) => void;
  clearMessages: (sessionId: string) => void;
  setInstances: (projectId: string, instances: OpenCodeInstance[]) => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  sessionsByProject: {},
  activeSessionId: null,
  messagesBySession: {},
  instancesByProject: {},

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

  addMessage: (sessionId, msg) =>
    set((state) => {
      const existing = state.messagesBySession[sessionId] ?? [];
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: [...existing, msg],
        },
      };
    }),

  clearMessages: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.messagesBySession;
      return { messagesBySession: rest };
    }),

  setInstances: (projectId, instances) =>
    set((state) => ({
      instancesByProject: { ...state.instancesByProject, [projectId]: instances },
    })),
}));
