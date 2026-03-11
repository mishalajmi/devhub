/**
 * TanStack Query hooks for project CRUD operations.
 * All Tauri calls go through src/lib/tauri.ts — never invoke() directly here.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listProjects,
  createProject,
  deleteProject,
  scanProjectFolder,
  pickFolder,
} from "@/lib/tauri";
import { useProjectsStore } from "@/stores/projects.store";
import { logger } from "@/lib/logger";
import type { CreateProjectInput, FolderScanResult } from "@/types/project";

const PROJECTS_KEY = ["projects"] as const;

/** Load all projects from SQLite on mount and sync to the Zustand store. */
export function useProjects() {
  const setProjects = useProjectsStore((s) => s.setProjects);

  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: async () => {
      const projects = await listProjects();
      setProjects(projects);
      return projects;
    },
  });
}

/** Mutation: create a project; invalidates the project list on success. */
export function useCreateProject() {
  const queryClient = useQueryClient();
  const addProject = useProjectsStore((s) => s.addProject);

  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: (project) => {
      addProject(project);
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      logger.info("useCreateProject", "Project created", { id: project.id });
    },
    onError: (err: unknown) => {
      logger.error("useCreateProject", "Failed to create project", {
        error: String(err),
      });
    },
  });
}

/** Mutation: delete a project with cascade; removes from store on success. */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  const removeProject = useProjectsStore((s) => s.removeProject);

  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: (_data, id) => {
      removeProject(id);
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      logger.info("useDeleteProject", "Project deleted", { id });
    },
    onError: (err: unknown) => {
      logger.error("useDeleteProject", "Failed to delete project", {
        error: String(err),
      });
    },
  });
}

/**
 * Open the native folder-picker dialog, then run the folder scanner.
 * Returns `null` if the user cancels.
 */
export async function pickAndScanFolder(): Promise<{
  path: string;
  scan: FolderScanResult;
} | null> {
  const path = await pickFolder();
  if (!path) return null;

  const scan = await scanProjectFolder(path);
  return { path, scan };
}
