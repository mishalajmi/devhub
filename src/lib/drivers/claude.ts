/**
 * Claude frontend driver proxy.
 *
 * Proxies every AgentDriver method call to the sidecar via `driver:*` IPC
 * messages.  All Claude SDK logic runs in the sidecar — this file contains
 * zero SDK code.
 *
 * Sidecar messages sent:
 *   driver:start   — spawn session, begin streaming
 *   driver:resume  — resume an existing Claude session by externalId
 *   driver:stop    — abort the generator and clean up
 *   driver:send    — send a follow-up prompt (resumes internally)
 *   driver:abort   — abort the currently running prompt
 *
 * Sidecar events received (via sidecar://event, routed by wireDriverEvents):
 *   driver:message  → options.onMessage
 *   driver:status   → options.onStatusChange
 *   driver:error    → options.onError
 */

import type { AgentDriver, AgentStartOptions } from "@devhub/types";
import { sendSidecarMessage } from "@/lib/tauri";
import { wireDriverEvents } from "./shared";

const DRIVER_ID = "claude";
const sessionListeners = new Map<string, () => void>();

export const claudeDriverProxy: AgentDriver = {
  id: "claude",
  name: "Claude Code",
  description:
    "Anthropic Claude Code agent via the Claude Agent SDK with full tool use",
  supportsResume: true,
  supportsMcp: true,
  async start(options: AgentStartOptions): Promise<void> {
    options.onStatusChange("initializing");
    const unlisten = await wireDriverEvents(
      DRIVER_ID,
      options.session.id,
      options,
    );
    sessionListeners.set(options.session.id, unlisten);
    await sendSidecarMessage({
      type: "driver:start",
      payload: {
        driverId: DRIVER_ID,
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
    const unlisten = await wireDriverEvents(
      DRIVER_ID,
      options.session.id,
      options,
    );
    sessionListeners.set(options.session.id, unlisten);
    await sendSidecarMessage({
      type: "driver:resume",
      payload: {
        driverId: DRIVER_ID,
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
      payload: {
        driverId: DRIVER_ID,
        sessionId: sessionId,
      },
    });
    sessionListeners.get(sessionId)?.();
    sessionListeners.delete(sessionId);
  },
  async send(sessionId: string, prompt: string): Promise<void> {
    await sendSidecarMessage({
      type: "driver:send",
      payload: {
        driverId: DRIVER_ID,
        sessionId: sessionId,
        prompt: prompt,
      },
    });
  },
  async abort(sessionId: string): Promise<void> {
    await sendSidecarMessage({
      type: "driver:abort",
      payload: {
        driverId: DRIVER_ID,
        sessionId: sessionId,
      },
    });
  },
};
