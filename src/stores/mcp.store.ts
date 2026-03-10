import { create } from "zustand";
import type { McpServer } from "@/types/mcp";

interface McpState {
  serversByProject: Record<string, McpServer[]>;

  setServers: (projectId: string, servers: McpServer[]) => void;
  addServer: (server: McpServer) => void;
  updateServer: (updated: McpServer) => void;
  removeServer: (id: string, projectId: string) => void;
}

export const useMcpStore = create<McpState>((set) => ({
  serversByProject: {},

  setServers: (projectId, servers) =>
    set((state) => ({
      serversByProject: { ...state.serversByProject, [projectId]: servers },
    })),

  addServer: (server) =>
    set((state) => {
      const existing = state.serversByProject[server.projectId] ?? [];
      return {
        serversByProject: {
          ...state.serversByProject,
          [server.projectId]: [...existing, server],
        },
      };
    }),

  updateServer: (updated) =>
    set((state) => {
      const existing = state.serversByProject[updated.projectId] ?? [];
      return {
        serversByProject: {
          ...state.serversByProject,
          [updated.projectId]: existing.map((s) => (s.id === updated.id ? updated : s)),
        },
      };
    }),

  removeServer: (id, projectId) =>
    set((state) => {
      const existing = state.serversByProject[projectId] ?? [];
      return {
        serversByProject: {
          ...state.serversByProject,
          [projectId]: existing.filter((s) => s.id !== id),
        },
      };
    }),
}));
