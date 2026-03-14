/**
 * Frontend driver proxy registry.
 *
 * Maps driver IDs to their IPC proxy objects.  Builtin proxies (opencode, claude)
 * are statically declared.  User-loaded local drivers registered in the sidecar
 * get a generic proxy — all calls are routed by driver id without any
 * per-driver frontend code.
 *
 * Usage:
 *   import { getDriverProxy } from "@/lib/drivers";
 *   const driver = getDriverProxy("opencode");
 *   const userDriver = getDriverProxy("my-custom-driver"); // generic proxy
 */

import type { AgentDriver, AgentStartOptions } from "@devhub/types";
import { sendSidecarMessage } from "@/lib/tauri";
import { wireDriverEvents } from "./shared";
import { opencodeDriverProxy } from "./opencode";
import { claudeDriverProxy } from "./claude";

const proxies: Record<string, AgentDriver> = {
  opencode: opencodeDriverProxy,
  claude: claudeDriverProxy,
};

// ─── Generic proxy factory ────────────────────────────────────────────────────

/**
 * Build a generic driver:* proxy for any driver id registered in the sidecar.
 * Used for user-loaded local drivers that have no dedicated frontend proxy file.
 */
function createGenericProxy(id: string): AgentDriver {
  const listeners = new Map<string, () => void>();

  return {
    id,
    name: id,
    description: `User-loaded driver: ${id}`,
    supportsResume: false,
    supportsMcp: false,

    async start(options: AgentStartOptions): Promise<void> {
      options.onStatusChange("initializing");
      const unlisten = await wireDriverEvents(id, options.session.id, options);
      listeners.set(options.session.id, unlisten);
      await sendSidecarMessage({
        type: "driver:start",
        payload: {
          driverId: id,
          sessionId: options.session.id,
          projectId: options.session.projectId,
          projectRoot: options.projectRoot,
          mcpServers: options.mcpServers,
          title: options.session.title ?? undefined,
        },
      });
    },

    async resume(options: AgentStartOptions): Promise<void> {
      options.onStatusChange("initializing");
      const unlisten = await wireDriverEvents(id, options.session.id, options);
      listeners.set(options.session.id, unlisten);
      await sendSidecarMessage({
        type: "driver:resume",
        payload: {
          driverId: id,
          sessionId: options.session.id,
          projectId: options.session.projectId,
          projectRoot: options.projectRoot,
          mcpServers: options.mcpServers,
          externalId: options.session.externalId ?? "",
          title: options.session.title ?? undefined,
        },
      });
    },

    async stop(sessionId: string): Promise<void> {
      await sendSidecarMessage({
        type: "driver:stop",
        payload: { driverId: id, sessionId },
      });
      listeners.get(sessionId)?.();
      listeners.delete(sessionId);
    },

    async send(sessionId: string, prompt: string): Promise<void> {
      await sendSidecarMessage({
        type: "driver:send",
        payload: { driverId: id, sessionId, prompt },
      });
    },

    async abort(sessionId: string): Promise<void> {
      await sendSidecarMessage({
        type: "driver:abort",
        payload: { driverId: id, sessionId },
      });
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the frontend IPC proxy for a given driver id.
 * Builtin drivers (opencode, claude) get their dedicated proxy.
 * Any other id gets a generic proxy — no error thrown.
 */
export function getDriverProxy(id: string): AgentDriver {
  return proxies[id] ?? createGenericProxy(id);
}
