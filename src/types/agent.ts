export type {
  AgentType,
  AgentSessionStatus,
  AgentSession,
  CreateAgentSessionInput,
  UpdateAgentSessionInput,
  SendMessageInput,
  OpenCodeInstance,
  OpenCodeSession,
  ClaudeEventType,
  ClaudeEvent,
  ClaudeMessage,
  McpServerConfig,
  AgentMessage,
} from "@devhub/types";

// SidecarMessage was superseded by SidecarRequest/SidecarResponse/SidecarEvent
// in @devhub/types. Re-export SidecarRequest as an alias for backward compat.
export type { SidecarRequest as SidecarMessage } from "@devhub/types";
