import { create } from "zustand";
import type { Project } from "@devhub/types";

interface ProjectsState {
  projects: Project[];
  selectedProjectId: string | null;

  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (updated: Project) => void;
  removeProject: (id: string) => void;
  selectProject: (id: string | null) => void;
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  selectedProjectId: null,

  setProjects: (projects) => set({ projects }),

  addProject: (project) =>
    set((state) => ({ projects: [...state.projects, project] })),

  updateProject: (updated) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
    })),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
    })),

  selectProject: (id) => set({ selectedProjectId: id }),
}));
