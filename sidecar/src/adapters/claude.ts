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
 * sidecar://event payloads of the form:
 *   { type: "claude:session:init",  sessionId, claudeSessionId }
 *   { type: "claude:message",       sessionId, message }
 *   { type: "claude:session:done",  sessionId }
 *   { type: "claude:session:error", sessionId, error }
 */

import { emit } from "../index.js";

// Dynamic import — @anthropic-ai/claude-agent-sdk may not be installed yet.
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

/** Active AbortControllers keyed by DevHub sessionId for abort support */
const activeRequests = new Map<string, AbortController>();

/**
 * Run a Claude session, streaming events back to the Tauri frontend.
 *
 * @param sessionId      - The DevHub agent session ID (used as correlation key)
 * @param prompt         - The user prompt to send
 * @param options        - Claude SDK options (mcpServers, resume, model, etc.)
 */
async function runSession(
  sessionId: string,
  prompt: string,
  options: Record<string, unknown>
): Promise<void> {
  const query = await getQueryFn();
  const controller = new AbortController();
  activeRequests.set(sessionId, controller);

  let claudeSessionId: string | undefined;

  try {
    for await (const message of query({ prompt, options })) {
      if (controller.signal.aborted) break;

      // Capture the Claude-native session ID from the system init message
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        (message as { type: string }).type === "system" &&
        "subtype" in message &&
        (message as { subtype: string }).subtype === "init" &&
        "session_id" in message
      ) {
        claudeSessionId = (message as { session_id: string }).session_id;
        emit("claude:session:init", {
          type: "claude:session:init",
          sessionId,
          claudeSessionId,
        });
      }

      emit("claude:message", {
        type: "claude:message",
        sessionId,
        message,
      });
    }

    emit("claude:session:done", {
      type: "claude:session:done",
      sessionId,
      claudeSessionId,
    });
  } catch (err) {
    emit("claude:session:error", {
      type: "claude:session:error",
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    activeRequests.delete(sessionId);
  }
}

export async function claudeAdapter(
  type: string,
  payload: Record<string, unknown>,
  _requestId: string
): Promise<unknown> {
  switch (type) {
    case "claude:session:create": {
      const { sessionId, prompt, mcpServers, allowedTools, model, workingDir } = payload as {
        sessionId: string;
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

      // Fire and forget — streams events back via stdout
      runSession(sessionId, prompt, options).catch((err) => {
        process.stderr.write(`[claude] session error: ${err}\n`);
      });

      return { started: true, sessionId };
    }

    case "claude:session:resume": {
      const { sessionId, claudeSessionId, prompt, mcpServers, allowedTools, model } = payload as {
        sessionId: string;
        claudeSessionId: string;
        prompt: string;
        mcpServers?: Record<string, unknown>;
        allowedTools?: string[];
        model?: string;
      };

      const options: Record<string, unknown> = { resume: claudeSessionId };
      if (mcpServers) options.mcpServers = mcpServers;
      if (allowedTools) options.allowedTools = allowedTools;
      if (model) options.model = model;

      runSession(sessionId, prompt, options).catch((err) => {
        process.stderr.write(`[claude] resume error: ${err}\n`);
      });

      return { started: true, sessionId, claudeSessionId };
    }

    case "claude:session:abort": {
      const { sessionId } = payload as { sessionId: string };
      activeRequests.get(sessionId)?.abort();
      activeRequests.delete(sessionId);
      return { aborted: true };
    }

    default:
      throw new Error(`claude adapter: unknown type ${type}`);
  }
}
