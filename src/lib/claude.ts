/**
 * Claude agent bridge — communicates with the Node.js sidecar via Tauri events.
 * Full implementation in Chunk 12 (Agents — Claude adapter).
 */

/** Placeholder — will use Tauri shell sidecar in Chunk 12 */
export const claudeBridge = {
  createSession: (_prompt: string, _options?: Record<string, unknown>) => {
    throw new Error("Claude bridge not yet implemented — see Chunk 12");
  },
  resumeSession: (_sessionId: string, _prompt: string) => {
    throw new Error("Claude bridge not yet implemented — see Chunk 12");
  },
  abortSession: (_requestId: string) => {
    throw new Error("Claude bridge not yet implemented — see Chunk 12");
  },
};
