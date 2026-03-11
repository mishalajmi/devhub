export type AgentType = "opencode" | "claude";

export type AgentSessionStatus = "running" | "idle" | "stopped" | "error";

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

export interface AgentMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface SendMessageInput {
  sessionId: string;
  content: string;
}

/** A discovered running OpenCode server instance */
export interface OpenCodeInstance {
  port: number;
  baseUrl: string;
  version: string;
  healthy: boolean;
}

/** OpenCode-specific session info from the HTTP API */
export interface OpenCodeSession {
  id: string;
  title?: string;
  parentID?: string;
  createdAt: string;
}

/** Sidecar IPC message envelope */
export interface SidecarMessage {
  type: string;
  sessionId?: string;
  payload: unknown;
}
