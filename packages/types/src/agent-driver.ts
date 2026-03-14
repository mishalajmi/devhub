import type { McpServerConfig } from "./mcp.js";
import type { AgentSession, AgentSessionStatus } from "./agent.js";

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

// ─── Remote sessions ──────────────────────────────────────────────────────────

export interface RemoteSession {
  externalId: string;
  title?: string;
  createdAt: string;
  raw?: unknown;
}

export interface AgentDriverWithRemoteSessions extends AgentDriver {
  listRemoteSessions(projectId: string): Promise<RemoteSession[]>;
}

// ─── Driver manifest ──────────────────────────────────────────────────────────

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

// ─── Type guard ───────────────────────────────────────────────────────────────

export function isDriverWithRemoteSessions(
  driver: AgentDriver
): driver is AgentDriverWithRemoteSessions {
  return "listRemoteSessions" in driver;
}
