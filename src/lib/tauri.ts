/**
 * Typed Tauri command wrappers.
 * ALL invoke() calls in the app must go through this file.
 * Never call invoke() directly from components or stores.
 */
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Project, CreateProjectInput, UpdateProjectInput, FolderScanResult, DirNode } from "@/types/project";
import type { AgentSession, CreateAgentSessionInput } from "@/types/agent";
import type { McpServer, CreateMcpServerInput, UpdateMcpServerInput } from "@/types/mcp";
import type { ProjectResource, CreateResourceInput, UpdateResourceInput } from "@/types/resource";
import type { Skill, CreateSkillInput, UpdateSkillInput } from "@/types/skill";

// ─── Projects ────────────────────────────────────────────────────────────────

/** List all projects stored in the local DB */
export const listProjects = (): Promise<Project[]> =>
  invoke("list_projects");

/** Get a single project by ID */
export const getProject = (id: string): Promise<Project> =>
  invoke("get_project", { id });

/** Create a new project from a folder path */
export const createProject = (input: CreateProjectInput): Promise<Project> =>
  invoke("create_project", { input });

/** Update project metadata */
export const updateProject = (input: UpdateProjectInput): Promise<Project> =>
  invoke("update_project", { input });

/** Delete a project and cascade-delete all its data */
export const deleteProject = (id: string): Promise<void> =>
  invoke("delete_project", { id });

/** Scan a folder path and return detected metadata */
export const scanProjectFolder = (path: string): Promise<FolderScanResult> =>
  invoke("scan_project_folder", { path });

/** List the directory tree of a project root (up to 6 levels deep) */
export const listDirTree = (rootPath: string): Promise<DirNode[]> =>
  invoke("list_dir_tree", { rootPath });

// ─── Dialog ───────────────────────────────────────────────────────────────────

/** Open a native folder-picker dialog; returns the selected path or null */
export const pickFolder = (): Promise<string | null> =>
  openDialog({ directory: true, multiple: false, title: "Select project folder" }) as Promise<string | null>;

/** Start watching a project's root directory for FS changes */
export const watchProject = (projectId: string): Promise<void> =>
  invoke("watch_project", { projectId });

/** Stop watching a project's root directory */
export const unwatchProject = (projectId: string): Promise<void> =>
  invoke("unwatch_project", { projectId });

// ─── Agent Sessions ───────────────────────────────────────────────────────────

/** List all agent sessions for a project */
export const listAgentSessions = (projectId: string): Promise<AgentSession[]> =>
  invoke("list_agent_sessions", { projectId });

/** Create a new agent session record */
export const createAgentSession = (input: CreateAgentSessionInput): Promise<AgentSession> =>
  invoke("create_agent_session", { input });

/** Update agent session status or title */
export const updateAgentSession = (
  id: string,
  updates: Partial<Pick<AgentSession, "status" | "title" | "externalId">>
): Promise<AgentSession> =>
  invoke("update_agent_session", { id, updates });

/** Delete an agent session */
export const deleteAgentSession = (id: string): Promise<void> =>
  invoke("delete_agent_session", { id });

// ─── MCP Servers ─────────────────────────────────────────────────────────────

/** List all MCP servers for a project */
export const listMcpServers = (projectId: string): Promise<McpServer[]> =>
  invoke("list_mcp_servers", { projectId });

/** Create a new MCP server config */
export const createMcpServer = (input: CreateMcpServerInput): Promise<McpServer> =>
  invoke("create_mcp_server", { input });

/** Update an MCP server config */
export const updateMcpServer = (input: UpdateMcpServerInput): Promise<McpServer> =>
  invoke("update_mcp_server", { input });

/** Delete an MCP server config (stops it first if running) */
export const deleteMcpServer = (id: string): Promise<void> =>
  invoke("delete_mcp_server", { id });

/** Start an MCP server process */
export const startMcpServer = (id: string): Promise<McpServer> =>
  invoke("start_mcp_server", { id });

/** Stop an MCP server process */
export const stopMcpServer = (id: string): Promise<McpServer> =>
  invoke("stop_mcp_server", { id });

// ─── Resources ────────────────────────────────────────────────────────────────

/** List all resources for a project */
export const listResources = (projectId: string): Promise<ProjectResource[]> =>
  invoke("list_resources", { projectId });

/** Create a resource entry */
export const createResource = (input: CreateResourceInput): Promise<ProjectResource> =>
  invoke("create_resource", { input });

/** Update a resource entry */
export const updateResource = (input: UpdateResourceInput): Promise<ProjectResource> =>
  invoke("update_resource", { input });

/** Delete a resource entry */
export const deleteResource = (id: string): Promise<void> =>
  invoke("delete_resource", { id });

// ─── Skills ───────────────────────────────────────────────────────────────────

/** List skills — pass projectId to include project-scoped + global, or omit for global only */
export const listSkills = (projectId?: string): Promise<Skill[]> =>
  invoke("list_skills", { projectId: projectId ?? null });

/** Create a skill */
export const createSkill = (input: CreateSkillInput): Promise<Skill> =>
  invoke("create_skill", { input });

/** Update a skill */
export const updateSkill = (input: UpdateSkillInput): Promise<Skill> =>
  invoke("update_skill", { input });

/** Delete a skill */
export const deleteSkill = (id: string): Promise<void> =>
  invoke("delete_skill", { id });
