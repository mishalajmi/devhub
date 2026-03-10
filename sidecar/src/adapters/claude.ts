/**
 * Claude Agent SDK adapter.
 *
 * Supported message types:
 *   claude:session:create   — start a new session with initial prompt
 *   claude:session:resume   — send a prompt to an existing session
 *   claude:session:abort    — abort the active generator for a session
 *
 * Streaming: each message/delta is emitted via stdout as an event.
 * The request resolves immediately with { started: true }; the frontend
 * receives streaming data via Tauri event listeners watching for
 * { event: "claude:message", payload: { requestId, sessionId, message } }
 */

import { emit } from "../index.js";

// Dynamic import — @anthropic-ai/claude-agent-sdk may not be installed yet
// (Chunk 12 will wire this fully). For now we stub the integration.
type QueryFn = (options: {
  prompt: string;
  options?: Record<string, unknown>;
}) => AsyncIterable<unknown>;

let queryFn: QueryFn | null = null;

async function getQueryFn(): Promise<QueryFn> {
  if (queryFn) return queryFn;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import("@anthropic-ai/claude-agent-sdk" as any);
    queryFn = mod.query as QueryFn;
    return queryFn!;
  } catch {
    throw new Error(
      "@anthropic-ai/claude-agent-sdk is not installed. Run: npm install @anthropic-ai/claude-agent-sdk in the sidecar directory."
    );
  }
}

/** Active AbortControllers keyed by requestId for abort support */
const activeRequests = new Map<string, AbortController>();

async function runSession(
  requestId: string,
  prompt: string,
  options: Record<string, unknown>
): Promise<void> {
  const query = await getQueryFn();
  const controller = new AbortController();
  activeRequests.set(requestId, controller);

  let sessionId: string | undefined;

  try {
    for await (const message of query({ prompt, options })) {
      if (controller.signal.aborted) break;

      // Capture session ID from init message
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        (message as { type: string }).type === "system" &&
        "subtype" in message &&
        (message as { subtype: string }).subtype === "init" &&
        "session_id" in message
      ) {
        sessionId = (message as { session_id: string }).session_id;
        emit("claude:session:init", { requestId, sessionId });
      }

      emit("claude:message", { requestId, sessionId, message });
    }

    emit("claude:session:done", { requestId, sessionId });
  } catch (err) {
    emit("claude:session:error", {
      requestId,
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    activeRequests.delete(requestId);
  }
}

export async function claudeAdapter(
  type: string,
  payload: Record<string, unknown>,
  requestId: string
): Promise<unknown> {
  switch (type) {
    case "claude:session:create": {
      const { prompt, mcpServers, allowedTools, model, workingDir } = payload as {
        prompt: string;
        mcpServers?: Record<string, unknown>;
        allowedTools?: string[];
        model?: string;
        workingDir?: string;
      };

      const options: Record<string, unknown> = {};
      if (mcpServers) options.mcpServers = mcpServers;
      if (allowedTools) options.allowedTools = allowedTools;
      if (model) options.model = model;
      if (workingDir) options.cwd = workingDir;

      // Fire and forget — streams events back
      runSession(requestId, prompt, options).catch((err) => {
        process.stderr.write(`[claude] session error: ${err}\n`);
      });

      return { started: true, requestId };
    }

    case "claude:session:resume": {
      const { sessionId, prompt, mcpServers, allowedTools, model } = payload as {
        sessionId: string;
        prompt: string;
        mcpServers?: Record<string, unknown>;
        allowedTools?: string[];
        model?: string;
      };

      const options: Record<string, unknown> = { resume: sessionId };
      if (mcpServers) options.mcpServers = mcpServers;
      if (allowedTools) options.allowedTools = allowedTools;
      if (model) options.model = model;

      runSession(requestId, prompt, options).catch((err) => {
        process.stderr.write(`[claude] resume error: ${err}\n`);
      });

      return { started: true, requestId, sessionId };
    }

    case "claude:session:abort": {
      const { targetRequestId } = payload as { targetRequestId: string };
      activeRequests.get(targetRequestId)?.abort();
      activeRequests.delete(targetRequestId);
      return { aborted: true };
    }

    default:
      throw new Error(`claude adapter: unknown type ${type}`);
  }
}
