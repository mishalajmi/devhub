import type { McpServerConfig } from "./mcp.js";
import type { RemoteSession } from "./agent-driver.js";

// ─── Core IPC envelope types ──────────────────────────────────────────────────

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

// ─── driver:* dispatch — typed payloads ───────────────────────────────────────

/**
 * Discriminated union of every `driver:*` message the sidecar accepts.
 * Narrowing on `type` gives fully-typed `payload` — no casting needed.
 */
export type DriverDispatchMessage =
  | {
      type: "driver:start";
      payload: {
        driverId: string;
        sessionId: string;
        projectId: string;
        projectRoot: string;
        mcpServers: McpServerConfig[];
        title?: string;
      };
    }
  | {
      type: "driver:resume";
      payload: {
        driverId: string;
        sessionId: string;
        projectId: string;
        projectRoot: string;
        mcpServers: McpServerConfig[];
        externalId: string;
        title?: string;
      };
    }
  | {
      type: "driver:stop";
      payload: { driverId: string; sessionId: string };
    }
  | {
      type: "driver:send";
      payload: { driverId: string; sessionId: string; prompt: string };
    }
  | {
      type: "driver:abort";
      payload: { driverId: string; sessionId: string };
    }
  | {
      type: "driver:inject-mcp";
      payload: { driverId: string; sessionId: string; server: McpServerConfig };
    }
  | {
      type: "driver:list-sessions";
      payload: { driverId: string; projectId: string };
    };

/** Convenience: extract the payload type for a specific driver:* message type */
export type DriverDispatchPayload<T extends DriverDispatchMessage["type"]> =
  Extract<DriverDispatchMessage, { type: T }>["payload"];

// ─── driver:* dispatch — typed results ───────────────────────────────────────

/**
 * Discriminated union of every possible success result from `handleDriverDispatch`.
 * Used as the return type instead of `Promise<unknown>`.
 */
export type DriverDispatchResult =
  | { started: true; sessionId: string }
  | { stopped: true }
  | { sent: true }
  | { aborted: true }
  | { injected: true }
  | RemoteSession[];
