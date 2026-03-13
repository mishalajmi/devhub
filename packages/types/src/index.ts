/**
 * @devhub/types
 *
 * Canonical type definitions shared between the frontend (src/) and the
 * sidecar (sidecar/src/). No runtime code. No dependencies.
 */

// ─── Project ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  // Detected metadata — not persisted, populated by the folder scanner
  hasGit?: boolean;
  hasDockerCompose?: boolean;
  hasEnvFile?: boolean;
  gitBranch?: string;
}

export interface FolderScanResult {
  hasGit: boolean;
  hasDockerCompose: boolean;
  hasEnvFile: boolean;
  gitBranch: string | null;
}

export interface CreateProjectInput {
  name: string;
  rootPath: string;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
}

export interface DirNode {
  name: string;
  path: string;
  isDir: boolean;
  children: DirNode[];
}

// ─── Resource ─────────────────────────────────────────────────────────────────

export type ResourceType = "docker" | "service" | "database" | "cloud" | "env";

/** Matches the Rust ResourceRow struct (camelCase serde). */
export interface ProjectResource {
  id: string;
  projectId: string;
  resourceType: ResourceType;
  name: string;
  configJson: string;
  createdAt: string;
  liveStatus?: ResourceLiveStatus;
}

export interface DockerResourceConfig {
  containerName?: string;
  image?: string;
}

export interface ServiceResourceConfig {
  port: number;
  protocol?: "http" | "https" | "tcp";
}

export interface DatabaseResourceConfig {
  connectionString: string;
  dbType: "postgres" | "mysql" | "sqlite" | "redis" | "mongodb";
}

export interface CloudResourceConfig {
  provider: "aws" | "gcp" | "azure";
  region?: string;
  resourceType?: string;
}

export interface EnvResourceConfig {
  filePath?: string;
  key?: string;
  value?: string;
}

export type ResourceConfig =
  | DockerResourceConfig
  | ServiceResourceConfig
  | DatabaseResourceConfig
  | CloudResourceConfig
  | EnvResourceConfig;

export interface ResourceLiveStatus {
  healthy: boolean;
  label: string;
  detail?: string;
  checkedAt: string;
}

export interface CreateResourceInput {
  projectId: string;
  resourceType: ResourceType;
  name: string;
  configJson: string;
}

export interface UpdateResourceInput {
  id: string;
  name: string;
  configJson: string;
}

// ─── MCP ─────────────────────────────────────────────────────────────────────

export type McpServerStatus = "running" | "stopped" | "error";

export interface McpServer {
  id: string;
  projectId: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  port: number | null;
  status: McpServerStatus;
  createdAt: string;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface CreateMcpServerInput {
  projectId: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface UpdateMcpServerInput {
  id: string;
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

// ─── Skill ────────────────────────────────────────────────────────────────────

export interface Skill {
  id: string;
  projectId: string | null; // null = global skill
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillInput {
  projectId?: string;
  title: string;
  content: string;
  tags?: string[];
}

export interface UpdateSkillInput {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
}

// ─── Agent session ────────────────────────────────────────────────────────────

export type AgentType = "opencode" | "claude";

export type AgentSessionStatus =
  | "initializing"
  | "idle"
  | "running"
  | "error"
  | "stopped";

export interface AgentSession {
  id: string;
  projectId: string;
  agentType: AgentType;
  externalId: string | null;
  status: AgentSessionStatus;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentSessionInput {
  projectId: string;
  agentType: AgentType;
  title?: string;
}

export interface UpdateAgentSessionInput {
  externalId?: string;
  status?: AgentSessionStatus;
  title?: string;
}

export interface SendMessageInput {
  sessionId: string;
  content: string;
}

// ─── OpenCode ─────────────────────────────────────────────────────────────────

export interface OpenCodeInstance {
  port: number;
  baseUrl: string;
  version: string;
  healthy: boolean;
}

export interface OpenCodeSession {
  id: string;
  title?: string;
  parentID?: string;
  createdAt: string;
}

// ─── Claude ───────────────────────────────────────────────────────────────────

export type ClaudeEventType =
  | "claude:session:init"
  | "claude:message"
  | "claude:session:done"
  | "claude:session:error";

export interface ClaudeEvent {
  type: ClaudeEventType;
  sessionId: string;
  claudeSessionId?: string;
  message?: ClaudeMessage;
  error?: string;
}

export interface ClaudeMessage {
  role: "assistant" | "user" | "tool";
  content: string;
  timestamp: string;
}

// ─── AgentMessage union ───────────────────────────────────────────────────────

export type AgentMessage =
  | {
      kind: "text";
      id: string;
      sessionId: string;
      role: "assistant" | "user";
      content: string;
      timestamp: string;
      metadata?: {
        model?: string;
        tokens?: { input: number; output: number };
      };
    }
  | {
      kind: "tool_use";
      id: string;
      sessionId: string;
      toolName: string;
      toolInput: unknown;
      timestamp: string;
    }
  | {
      kind: "tool_result";
      id: string;
      sessionId: string;
      toolName: string;
      toolOutput: unknown;
      isError: boolean;
      timestamp: string;
    }
  | {
      kind: "system";
      id: string;
      sessionId: string;
      event: "init" | "done" | "error" | "heartbeat";
      detail?: string;
      timestamp: string;
    };

// ─── AgentDriver contract ─────────────────────────────────────────────────────

export interface AgentStartOptions {
  session: AgentSession;
  projectRoot: string;
  mcpServers: McpServerConfig[];
  onMessage: (msg: AgentMessage) => void;
  onStatusChange: (status: AgentSessionStatus) => void;
  onError: (err: Error) => void;
}

export interface AgentDriver {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly supportsResume: boolean;
  readonly supportsMcp: boolean;

  start(options: AgentStartOptions): Promise<void>;
  resume(options: AgentStartOptions): Promise<void>;
  stop(sessionId: string): Promise<void>;
  send(sessionId: string, prompt: string): Promise<void>;
  abort(sessionId: string): Promise<void>;

  getBaseUrl?(sessionId: string): string | null;
  injectMcp?(sessionId: string, server: McpServerConfig): Promise<void>;
}

export interface RemoteSession {
  externalId: string;
  title?: string;
  createdAt: string;
  raw?: unknown;
}

export interface AgentDriverWithRemoteSessions extends AgentDriver {
  listRemoteSessions(projectId: string): Promise<RemoteSession[]>;
}

export interface AgentDriverManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  source: "builtin" | "local";
  path?: string;
  supportsResume: boolean;
  supportsMcp: boolean;
  hasRemoteSessions: boolean;
}

export function isDriverWithRemoteSessions(
  driver: AgentDriver
): driver is AgentDriverWithRemoteSessions {
  return "listRemoteSessions" in driver;
}

// ─── Sidecar IPC envelopes ────────────────────────────────────────────────────

export interface SidecarRequest {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export type SidecarResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

export interface SidecarEvent {
  event: string;
  payload: unknown;
}
