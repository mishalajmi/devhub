/**
 * Claude Agent SDK adapter.
 *
 * Supported message types:
 *   driver:session:create   — start a new session with initial prompt
 *   driver:session:resume   — send a prompt to an existing session
 *   driver:session:abort    — abort the active generator for a session
 *
 * Streaming: each message/delta is emitted via stdout as an event.
 * The request resolves immediately with { started: true }; the frontend
 * receives streaming data via Tauri event listeners watching for
 * sidecar://event payloads of the form:
 *   { type: "driver:session:init",  sessionId, claudeSessionId }
 *   { type: "driver:message",       sessionId, message }
 *   { type: "driver:session:done",  sessionId }
 *   { type: "driver:session:error", sessionId, error }
 */

import { AgentDriver, AgentMessage } from "@devhub/types";
import { emit } from "../index.js";

interface RawClaudeMessage {
  type?: string;
  subtype?: string;
  role?: string;
  content?:
    | string
    | Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
        tool_use_id?: string;
        output?: string;
      }>;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  output?: unknown;
  is_error?: boolean;
  session_id?: string;
}

const claudeSessionIds = new Map<string, string>();

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

function mapClaudeMessage(
  sessionId: string,
  raw: RawClaudeMessage,
): AgentMessage[] {
  const now = new Date().toISOString();
  const msgs: AgentMessage[] = [];

  // system.init — session established
  if (raw.type === "system" && raw.subtype === "init") {
    msgs.push({
      kind: "system",
      id: crypto.randomUUID(),
      sessionId,
      event: "init",
      detail: raw.session_id,
      timestamp: now,
    });
    return msgs;
  }

  // assistant text message
  if (raw.role === "assistant") {
    const content = raw.content;
    if (typeof content === "string") {
      msgs.push({
        kind: "text",
        id: crypto.randomUUID(),
        sessionId,
        role: "assistant",
        content,
        timestamp: now,
      });
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text" && block.text) {
          msgs.push({
            kind: "text",
            id: crypto.randomUUID(),
            sessionId,
            role: "assistant",
            content: block.text,
            timestamp: now,
          });
        } else if (block.type === "tool_use") {
          msgs.push({
            kind: "tool_use",
            id: block.id ?? crypto.randomUUID(),
            sessionId,
            toolName: block.name ?? "unknown",
            toolInput: block.input ?? {},
            timestamp: now,
          });
        }
      }
    }
    return msgs;
  }

  // tool result
  if (raw.role === "tool" || raw.type === "tool_result") {
    msgs.push({
      kind: "tool_result",
      id: crypto.randomUUID(),
      sessionId,
      toolName: raw.name ?? "unknown",
      toolOutput: raw.output ?? null,
      isError: raw.is_error ?? false,
      timestamp: now,
    });
    return msgs;
  }

  // end_turn
  if (raw.type === "end_turn") {
    msgs.push({
      kind: "system",
      id: crypto.randomUUID(),
      sessionId,
      event: "done",
      timestamp: now,
    });
    return msgs;
  }

  return msgs;
}

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
    for await (const message of query({ prompt, options: { ...options, signal: controller.signal } })) {
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
        claudeSessionIds.set(sessionId, claudeSessionId);
        emit("driver:status", { driverId: "claude", sessionId, status: "running" });
      }

      // mapClaudeMessage returns an array — emit one event per message
      for (const msg of mapClaudeMessage(sessionId, message as RawClaudeMessage)) {
        emit("driver:message", { driverId: "claude", sessionId, message: msg });
      }
    }

    emit("driver:status", { driverId: "claude", sessionId, status: "idle" });
  } catch (err) {
    if (controller.signal.aborted) return; // normal teardown — don't emit error
    emit("driver:error", {
      driverId: "claude",
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    activeRequests.delete(sessionId);
    claudeSessionIds.delete(sessionId);
  }
}

export const claudeDriver: AgentDriver = {
  id: "claude",
  name: "Claude Code",
  description: "Anthropic Claude agent via the Claude Agent SDK with full tool use",
  supportsResume: true,
  supportsMcp: true,
  async start ({ session, projectRoot, mcpServers, onStatusChange, onError }): Promise<void> {
    const mcpConfig = mcpServers.length > 0
      ? Object.fromEntries(mcpServers.map(s => [s.name, s]))
      : undefined;

    onStatusChange("initializing");
    runSession(session.id, "", {
      cwd: projectRoot,
      ...(mcpConfig ? { mcpServers: mcpConfig } : {})
    }).catch(err => onError(err instanceof Error ? err : new Error(String(err))));
    onStatusChange("idle");
  },
  async resume({ session, onStatusChange, onError }): Promise<void> {
    if (!session.externalId)
      throw new Error(`No externalId for Claude session ${session.id}`)
    onStatusChange("initializing");
    runSession(session.id, "", { resume: session.externalId })
      .catch(err => onError(err instanceof Error ? err : new Error(String(err))));
    onStatusChange("idle");
  },
  async stop (sessionId: string): Promise<void> {
    activeRequests.get(sessionId)?.abort();
    activeRequests.delete(sessionId);
    claudeSessionIds.delete(sessionId);
  },
  async send(sessionId: string, prompt: string): Promise<void> {
    activeRequests.get(sessionId)?.abort();
    const claudeSessionId = claudeSessionIds.get(sessionId);
    runSession(sessionId, prompt, claudeSessionId ? { resume: claudeSessionId } : {})
      .catch(err => process.stderr.write(`[claude-driver]: send error: ${err}\n`));
  },
  async abort(sessionId: string): Promise<void> {
    activeRequests.get(sessionId)?.abort();
    activeRequests.delete(sessionId);
  }
}
