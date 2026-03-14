/**
 * OpenCode frontend driver proxy.
 *
 * Proxies every AgentDriver method call to the sidecar via `driver:*` IPC
 * messages.  All OpenCode SDK logic (process spawning, HTTP, SSE) runs in the
 * sidecar — this file contains zero SDK code.
 *
 * Sidecar messages sent:
 *   driver:start         — spawn server, create session, wire SSE
 *   driver:resume        — spawn server, attach to existing session
 *   driver:stop          — kill SSE + server process
 *   driver:send          — promptAsync on the active session
 *   driver:abort         — abort the running prompt
 *   driver:inject-mcp    — add an MCP server to the running instance
 *   driver:list-sessions — list remote sessions (via Tauri command)
 *
 * Sidecar events received (via sidecar://event, routed by wireDriverEvents):
 *   driver:message  → options.onMessage
 *   driver:status   → options.onStatusChange
 *   driver:error    → options.onError
 */

import type {
  AgentDriverWithRemoteSessions,
  AgentStartOptions,
  McpServerConfig,
  RemoteSession,
} from "@devhub/types";
import { sendSidecarMessage, listDriverSessions } from "@/lib/tauri";
import { wireDriverEvents } from "./shared";

const DRIVER_ID = "opencode";

/** Unlisten handles keyed by DevHub sessionId — cleaned up on stop */
const sessionListeners = new Map<string, () => void>();

export const opencodeDriverProxy: AgentDriverWithRemoteSessions = {
  id: DRIVER_ID,
  name: "OpenCode",
  description: "AI coding agent with full filesystem and tool access via opencode serve",
  supportsResume: true,
  supportsMcp: true,

  async start(options: AgentStartOptions): Promise<void> {
    const { session, projectRoot, mcpServers } = options;

    options.onStatusChange("initializing");

    const unlisten = await wireDriverEvents(DRIVER_ID, session.id, options);
    sessionListeners.set(session.id, unlisten);

    await sendSidecarMessage({
      type: "driver:start",
      payload: {
        driverId: DRIVER_ID,
        sessionId: session.id,
        projectId: session.projectId,
        projectRoot,
        mcpServers,
        title: session.title ?? undefined,
      },
    });
  },

  async resume(options: AgentStartOptions): Promise<void> {
    const { session, projectRoot, mcpServers } = options;

    options.onStatusChange("initializing");

    const unlisten = await wireDriverEvents(DRIVER_ID, session.id, options);
    sessionListeners.set(session.id, unlisten);

    await sendSidecarMessage({
      type: "driver:resume",
      payload: {
        driverId: DRIVER_ID,
        sessionId: session.id,
        projectId: session.projectId,
        projectRoot,
        mcpServers,
        externalId: session.externalId ?? "",
        title: session.title ?? undefined,
      },
    });
  },

  async stop(sessionId: string): Promise<void> {
    await sendSidecarMessage({
      type: "driver:stop",
      payload: { driverId: DRIVER_ID, sessionId },
    });

    sessionListeners.get(sessionId)?.();
    sessionListeners.delete(sessionId);
  },

  async send(sessionId: string, prompt: string): Promise<void> {
    await sendSidecarMessage({
      type: "driver:send",
      payload: { driverId: DRIVER_ID, sessionId, prompt },
    });
  },

  async abort(sessionId: string): Promise<void> {
    await sendSidecarMessage({
      type: "driver:abort",
      payload: { driverId: DRIVER_ID, sessionId },
    });
  },

  getBaseUrl(_sessionId: string): string | null {
    // The server URL lives in the sidecar process — not accessible from the frontend.
    return null;
  },

  async injectMcp(sessionId: string, server: McpServerConfig): Promise<void> {
    await sendSidecarMessage({
      type: "driver:inject-mcp",
      payload: { driverId: DRIVER_ID, sessionId, server },
    });
  },

  async listRemoteSessions(projectId: string): Promise<RemoteSession[]> {
    // Uses the Tauri request-response channel so we get the result back
    // directly — no fire-and-forget correlation dance needed.
    return listDriverSessions(DRIVER_ID, projectId);
  },
};
