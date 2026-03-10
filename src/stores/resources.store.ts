import { create } from "zustand";
import type { ProjectResource } from "@/types/resource";

interface ResourcesState {
  resourcesByProject: Record<string, ProjectResource[]>;

  setResources: (projectId: string, resources: ProjectResource[]) => void;
  addResource: (resource: ProjectResource) => void;
  updateResourceStatus: (id: string, projectId: string, liveStatus: ProjectResource["liveStatus"]) => void;
  removeResource: (id: string, projectId: string) => void;
}

export const useResourcesStore = create<ResourcesState>((set) => ({
  resourcesByProject: {},

  setResources: (projectId, resources) =>
    set((state) => ({
      resourcesByProject: { ...state.resourcesByProject, [projectId]: resources },
    })),

  addResource: (resource) =>
    set((state) => {
      const existing = state.resourcesByProject[resource.projectId] ?? [];
      return {
        resourcesByProject: {
          ...state.resourcesByProject,
          [resource.projectId]: [...existing, resource],
        },
      };
    }),

  updateResourceStatus: (id, projectId, liveStatus) =>
    set((state) => {
      const existing = state.resourcesByProject[projectId] ?? [];
      return {
        resourcesByProject: {
          ...state.resourcesByProject,
          [projectId]: existing.map((r) =>
            r.id === id ? { ...r, liveStatus } : r
          ),
        },
      };
    }),

  removeResource: (id, projectId) =>
    set((state) => {
      const existing = state.resourcesByProject[projectId] ?? [];
      return {
        resourcesByProject: {
          ...state.resourcesByProject,
          [projectId]: existing.filter((r) => r.id !== id),
        },
      };
    }),
}));
