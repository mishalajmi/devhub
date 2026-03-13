/**
 * Claude IPC bridge — communicates with the Node.js sidecar via Tauri sidecar events.
 *
 * All messages are sent to the sidecar via `sendSidecarMessage()` (stdin JSON lines).
 * All incoming events arrive via `onSidecarEvent()` (Tauri `sidecar://event` events).
 *
 * Frontend → Sidecar message shapes:
 *   { type: "claude:session:create", sessionId, prompt, mcpServers }
 *   { type: "claude:session:resume", sessionId, claudeSessionId, prompt }
 *   { type: "claude:session:abort",  sessionId }
 *
 * Sidecar → Frontend event payload shapes:
 *   { type: "claude:session:init",  sessionId, claudeSessionId }
 *   { type: "claude:message",       sessionId, message }
 *   { type: "claude:session:done",  sessionId }
 *   { type: "claude:session:error", sessionId, error }
 */

import { sendSidecarMessage, onSidecarEvent } from "@/lib/tauri";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { ClaudeEvent, McpServerConfig } from "@devhub/types";

/**
 * Send a `claude:session:create` message to the sidecar.
 * The sidecar will fire-and-forget the session and stream events back.
 */
export function createClaudeSession(
  sessionId: string,
  prompt: string,
  mcpServers: McpServerConfig[]
): Promise<void> {
  return sendSidecarMessage({ type: "claude:session:create", sessionId, prompt, mcpServers });
}

/**
 * Send a `claude:session:resume` message to the sidecar.
 * Requires the Claude-native session ID (stored as `externalId` in SQLite).
 */
export function resumeClaudeSession(
  sessionId: string,
  claudeSessionId: string,
  prompt: string
): Promise<void> {
  return sendSidecarMessage({
    type: "claude:session:resume",
    sessionId,
    claudeSessionId,
    prompt,
  });
}

/**
 * Send a `claude:session:abort` message to the sidecar.
 * The sidecar will abort the active generator for this session.
 */
export function abortClaudeSession(sessionId: string): Promise<void> {
  return sendSidecarMessage({ type: "claude:session:abort", sessionId });
}

/**
 * Subscribe to all `claude:*` events forwarded from the sidecar.
 * Filters the raw `sidecar://event` stream for Claude event types only.
 *
 * @returns A Promise resolving to an unlisten function — call it to unsubscribe.
 */
export function onClaudeEvent(
  callback: (event: ClaudeEvent) => void
): Promise<UnlistenFn> {
  return onSidecarEvent((raw) => {
    const payload = raw as { type?: string };
    if (
      typeof payload?.type === "string" &&
      payload.type.startsWith("claude:")
    ) {
      callback(payload as ClaudeEvent);
    }
  });
}
