import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listAgentSessions,
  listResources,
  listMcpServers,
  listSkills,
  listProjects,
  createProject,
  deleteProject,
  pickFolder,
  scanProjectFolder,
  createResource,
  updateResource,
  deleteResource,
} from "@/lib/tauri";
import type { AgentSession } from "@/types/agent";
import type { ProjectResource, CreateResourceInput, UpdateResourceInput } from "@/types/resource";
import type { McpServer } from "@/types/mcp";
import type { Skill } from "@/types/skill";
import { useProjectsStore } from "@/stores/projects.store";
import { logger } from "@/lib/logger";
import type { CreateProjectInput, FolderScanResult } from "@/types/project";

/** Query key factory for project-scoped data */
export const projectKeys = {
  all: ["projects"] as const,
  sessions: (projectId: string) => ["projects", projectId, "sessions"] as const,
  resources: (projectId: string) =>
    ["projects", projectId, "resources"] as const,
  mcpServers: (projectId: string) =>
    ["projects", projectId, "mcpServers"] as const,
  skills: (projectId: string) => ["projects", projectId, "skills"] as const,
};

/** Fetch agent sessions for a project */
export function useAgentSessionsQuery(projectId: string) {
  return useQuery<AgentSession[]>({
    queryKey: projectKeys.sessions(projectId),
    queryFn: () => listAgentSessions(projectId),
    enabled: Boolean(projectId),
  });
}

/** Fetch resources for a project */
export function useResourcesQuery(projectId: string) {
  return useQuery<ProjectResource[]>({
    queryKey: projectKeys.resources(projectId),
    queryFn: () => listResources(projectId),
    enabled: Boolean(projectId),
  });
}

/** Fetch MCP servers for a project */
export function useMcpServersQuery(projectId: string) {
  return useQuery<McpServer[]>({
    queryKey: projectKeys.mcpServers(projectId),
    queryFn: () => listMcpServers(projectId),
    enabled: Boolean(projectId),
  });
}

/** Fetch skills for a project (includes global skills) */
export function useSkillsQuery(projectId: string) {
  return useQuery<Skill[]>({
    queryKey: projectKeys.skills(projectId),
    queryFn: () => listSkills(projectId),
    enabled: Boolean(projectId),
  });
}

/** Load all projects from SQLite on mount and sync to the Zustand store. */
export function useProjects() {
  const setProjects = useProjectsStore((s) => s.setProjects);

  return useQuery({
    queryKey: projectKeys.all,
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
  const selectProject = useProjectsStore((s) => s.selectProject);

  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: (project) => {
      addProject(project);
      selectProject(project.id);
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
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
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      logger.info("useDeleteProject", "Project deleted", { id });
    },
    onError: (err: unknown) => {
      logger.error("useDeleteProject", "Failed to delete project", {
        error: String(err),
      });
    },
  });
}

/** Mutation: create a resource; invalidates the resource list on success. */
export function useCreateResource(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateResourceInput) => createResource(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.resources(projectId) });
      logger.info("useCreateResource", "Resource created", { projectId });
    },
    onError: (err: unknown) => {
      logger.error("useCreateResource", "Failed to create resource", { error: String(err) });
    },
  });
}

/** Mutation: update a resource's name and config; invalidates the resource list on success. */
export function useUpdateResource(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateResourceInput) => updateResource(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.resources(projectId) });
      logger.info("useUpdateResource", "Resource updated", { projectId });
    },
    onError: (err: unknown) => {
      logger.error("useUpdateResource", "Failed to update resource", { error: String(err) });
    },
  });
}

/** Mutation: delete a resource; invalidates the resource list on success. */
export function useDeleteResource(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteResource(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.resources(projectId) });
      logger.info("useDeleteResource", "Resource deleted", { id, projectId });
    },
    onError: (err: unknown) => {
      logger.error("useDeleteResource", "Failed to delete resource", { error: String(err) });
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
