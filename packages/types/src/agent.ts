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
