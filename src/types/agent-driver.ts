import {
  AgentSession,
  AgentSessionStatus,
  McpServerConfig,
} from "@/types/agent";
import type { Project } from "@/types/project";

export type AgentMessage =
  | {
      kind: "text";
      id: string;
      sessionId: string;
      role: "assistant" | "user";
      content: string;
      timestamp: string;
      metadata?: { model?: string; tokens?: { input: number; output: number } };
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

export type sessionStatus =
  | "initializing"
  | "idle"
  | "running"
  | "error"
  | "stopped";

export interface AgentStartOptions {
  session: AgentSession;
  project: Project;
  mcpServers: McpServerConfig[];
  onMessage: (msg: AgentMessage) => void;
  onStatusChange: (status: AgentSessionStatus) => void;
  onError: (err: Error) => void;
}

export interface RemoteSession {
  externalId: string; // Session ID in the agent's own system  (maps to agent_session.external_id)
  title?: string;
  createdAt: string;
  raw?: unknown;
}

export interface AgentDriver {
  /** Unique id, must match against agent_type stored in db */
  readonly id: string;
  /** Human readable name shown in UI */
  readonly name: string;
  /** Short description shown in the new-session dialog */
  readonly description: string;
  /** Whether this driver can resume sessions across app restarts via externalId */
  readonly supportsResume: boolean;
  /** Whteher this driver accepts mcp injection at session start*/
  readonly supportsMcp: boolean;
  /** Starts a new session. Must call onStatusChange("initializing") -> onStatusChange("idle") */
  start(options: AgentStartOptions): Promise<void>;
  /** Resume an existing session using session.externalId */
  resume(options: AgentStartOptions): Promise<void>;
  /** Gracefully stop the current session and release resources */
  stop(sessionId: string): Promise<void>;
  /** Send a prompt. Driver calls onMessage() for each response chunk/event */
  send(sessionId: string, prompt: string): Promise<void>;
  /** Abort an in-progress response. Does not stop the session */
  abort(sessionId: string): Promise<void>;
  /** Return the HTTP base URL of the agent server, if applicable */
  getBaseUrl?(sessionId: string): string | null;
  /** Inject an mcp server into a running session (if supportsMcp is true) */
  injectMcp?(sessionId: string, server: McpServerConfig): Promise<void>;
}

export interface AgentDriverWithRemoteSessions extends AgentDriver {
  /**
   * List sessions known to the remote agent server.
   * Used to reconcile with DevHub's records on app start.
   */
  listRemoteSessions(projectId: string): Promise<RemoteSession[]>;
}

export interface AgentDriverManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  /** "builtin" drivers ship with with DevHub. "local" are loaded from disk by user */
  source: "builtin" | "local";
  /** Absloute path for the driver file (only set for "local" drivers) */
  path?: string;
  supportsResume: boolean;
  supportsMcp: boolean;
  hasRemoteSessions: boolean;
}

export function isDriverWithRemoteSessions(
  driver: AgentDriver,
): driver is AgentDriverWithRemoteSessions {
  return "listRemoteSessions" in driver;
}
