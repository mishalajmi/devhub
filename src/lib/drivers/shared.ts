/**
 * Shared helpers for frontend driver proxies.
 *
 * All builtin and user-loaded driver proxies use the same `driver:*` IPC
 * event protocol.  This module centralises the event-wiring logic so each
 * proxy stays thin.
 */

import type { AgentMessage, AgentSessionStatus, AgentStartOptions } from "@devhub/types";
import { onSidecarEvent } from "@/lib/tauri";

/**
 * Subscribe to `sidecar://event` and route `driver:message`, `driver:status`,
 * and `driver:error` payloads that match `driverId` + `sessionId` into the
 * provided AgentStartOptions callbacks.
 *
 * Returns an unlisten function — call it to stop listening (e.g. on stop/cleanup).
 */
export async function wireDriverEvents(
  driverId: string,
  sessionId: string,
  options: Pick<AgentStartOptions, "onMessage" | "onStatusChange" | "onError">,
): Promise<() => void> {
  return onSidecarEvent((raw) => {
    const envelope = raw as Record<string, unknown>;
    const payload = envelope["payload"] as Record<string, unknown> | undefined;
    if (!payload) return;
    if (payload["driverId"] !== driverId) return;
    if (payload["sessionId"] !== sessionId) return;

    switch (envelope["event"]) {
      case "driver:message":
        options.onMessage(payload["message"] as AgentMessage);
        break;
      case "driver:status":
        options.onStatusChange(payload["status"] as AgentSessionStatus);
        break;
      case "driver:error":
        options.onError(new Error((payload["error"] as string | undefined) ?? "Unknown driver error"));
        break;
    }
  });
}
