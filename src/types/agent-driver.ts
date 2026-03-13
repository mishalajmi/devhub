/**
 * Re-exports from @devhub/types — the canonical source of truth for
 * agent driver types shared between the frontend and sidecar.
 *
 * Import from here within the frontend (src/) codebase.
 * The sidecar imports directly from @devhub/types.
 */
export type {
  AgentMessage,
  AgentSessionStatus,
  AgentSession,
  AgentStartOptions,
  AgentDriver,
  AgentDriverWithRemoteSessions,
  AgentDriverManifest,
  RemoteSession,
  McpServerConfig,
} from "@devhub/types";

export { isDriverWithRemoteSessions } from "@devhub/types";
