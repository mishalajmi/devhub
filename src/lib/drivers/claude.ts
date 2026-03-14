/**
 * Claude frontend driver shim.
 *
 * Implements AgentDriver by proxying every method call to the sidecar via
 * sendSidecarMessage / onSidecarEvent.  No Anthropic SDK code runs in the
 * frontend — all streaming logic lives in the sidecar adapter.
 *
 * Claude sessions are fire-and-stream: the sidecar starts iterating the SDK
 * generator immediately and emits each message/event to stdout, which Tauri
 * forwards as sidecar://event payloads.
 *
 * Sidecar message types sent:
 *   claude:session:create  — start a new session with an initial prompt
 *   claude:session:resume  — send a prompt to an existing session
 *   claude:session:abort   — abort the active generator for a session
 *
 * Sidecar events received (via sidecar://event):
 *   { event: "claude:session:init",  payload: { sessionId, claudeSessionId } }
 *   { event: "claude:message",       payload: { sessionId, message } }
 *   { event: "claude:session:done",  payload: { sessionId } }
 *   { event: "claude:session:error", payload: { sessionId, error } }
 */

import type {
  AgentDriver,
  AgentStartOptions,
  AgentMessage,
  SessionState,
} from "@devhub/types";
import { sendSidecarMessage, onSidecarEvent } from "@/lib/tauri";

const sessions = new Map<string, SessionState>();

// ─── Claude SDK message → AgentMessage mapping ────────────────────────────────

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

// ─── Shim implementation ──────────────────────────────────────────────────────

export const claudeDriverShim: AgentDriver = {
  id: "claude",
  name: "Claude",
  description:
    "Anthropic Claude agent via the Claude Agent SDK with full tool use",
  supportsResume: true,
  supportsMcp: true,

  async start(options: AgentStartOptions): Promise<void> {
    const {
      session,
      projectRoot,
      mcpServers,
      onMessage,
      onStatusChange,
      onError,
    } = options;

    onStatusChange("initializing");

    // Build MCP server config in the shape the Claude SDK expects.
    const mcpConfig =
      mcpServers.length > 0
        ? Object.fromEntries(mcpServers.map((s) => [s.name, s]))
        : undefined;

    // Wire sidecar events → AgentMessage callbacks before sending the
    // create message so no events are missed.
    const unlisten = await onSidecarEvent((raw) => {
      const envelope = raw as Record<string, unknown>;
      const evtSessionId = (envelope["payload"] as Record<string, unknown>)?.[
        "sessionId"
      ] as string | undefined;

      if (evtSessionId !== session.id) return;

      switch (envelope["event"]) {
        case "claude:session:init": {
          onStatusChange("running");
          const claudeSessionId = (
            envelope["payload"] as Record<string, unknown>
          )?.["claudeSessionId"] as string | undefined;
          onMessage({
            kind: "system",
            id: crypto.randomUUID(),
            sessionId: session.id,
            event: "init",
            detail: claudeSessionId,
            timestamp: new Date().toISOString(),
          });
          break;
        }

        case "claude:message": {
          const rawMsg = (envelope["payload"] as Record<string, unknown>)?.[
            "message"
          ] as RawClaudeMessage | undefined;
          if (!rawMsg) break;
          for (const msg of mapClaudeMessage(session.id, rawMsg)) {
            onMessage(msg);
          }
          break;
        }

        case "claude:session:done": {
          onMessage({
            kind: "system",
            id: crypto.randomUUID(),
            sessionId: session.id,
            event: "done",
            timestamp: new Date().toISOString(),
          });
          onStatusChange("idle");
          break;
        }

        case "claude:session:error": {
          const errMsg = (envelope["payload"] as Record<string, unknown>)?.[
            "error"
          ] as string | undefined;
          onMessage({
            kind: "system",
            id: crypto.randomUUID(),
            sessionId: session.id,
            event: "error",
            detail: errMsg ?? "unknown error",
            timestamp: new Date().toISOString(),
          });
          onError(new Error(errMsg ?? "Claude session error"));
          onStatusChange("error");
          break;
        }
      }
    });

    sessions.set(session.id, { unlisten });

    // Fire the create request — the sidecar streams events back immediately.
    await sendSidecarMessage({
      type: "claude:session:create",
      payload: {
        sessionId: session.id,
        // Claude requires an initial prompt at session creation time.
        // Send an empty string; the real prompt comes via send().
        prompt: "",
        workingDir: projectRoot,
        ...(mcpConfig ? { mcpServers: mcpConfig } : {}),
      },
    });

    onStatusChange("idle");
  },

  async resume(options: AgentStartOptions): Promise<void> {
    const {
      session,
      projectRoot,
      mcpServers,
      onMessage,
      onStatusChange,
      onError,
    } = options;

    if (!session.externalId) {
      throw new Error(
        `Cannot resume Claude session ${session.id}: no externalId`,
      );
    }

    onStatusChange("initializing");

    const mcpConfig =
      mcpServers.length > 0
        ? Object.fromEntries(mcpServers.map((s) => [s.name, s]))
        : undefined;

    const unlisten = await onSidecarEvent((raw) => {
      const envelope = raw as Record<string, unknown>;
      const evtSessionId = (envelope["payload"] as Record<string, unknown>)?.[
        "sessionId"
      ] as string | undefined;

      if (evtSessionId !== session.id) return;

      switch (envelope["event"]) {
        case "claude:session:done":
          onStatusChange("idle");
          break;
        case "claude:session:error": {
          const errMsg = (envelope["payload"] as Record<string, unknown>)?.[
            "error"
          ] as string | undefined;
          onError(new Error(errMsg ?? "Claude session error"));
          onStatusChange("error");
          break;
        }
        case "claude:message": {
          const rawMsg = (envelope["payload"] as Record<string, unknown>)?.[
            "message"
          ] as RawClaudeMessage | undefined;
          if (!rawMsg) break;
          for (const msg of mapClaudeMessage(session.id, rawMsg)) {
            onMessage(msg);
          }
          break;
        }
      }
    });

    sessions.set(session.id, { unlisten });

    await sendSidecarMessage({
      type: "claude:session:resume",
      payload: {
        sessionId: session.id,
        claudeSessionId: session.externalId,
        prompt: "",
        workingDir: projectRoot,
        ...(mcpConfig ? { mcpServers: mcpConfig } : {}),
      },
    });

    onStatusChange("idle");
  },

  async stop(sessionId: string): Promise<void> {
    const state = sessions.get(sessionId);
    if (!state) return;

    await sendSidecarMessage({
      type: "claude:session:abort",
      payload: { sessionId },
    });

    state.unlisten();
    sessions.delete(sessionId);
  },

  async send(sessionId: string, prompt: string): Promise<void> {
    // Claude doesn't have a standalone send — a new prompt starts a new
    // generator on the same session via resume. Fire abort first to cancel
    // any in-progress response, then send as a resume with the new prompt.
    await sendSidecarMessage({
      type: "claude:session:abort",
      payload: { sessionId },
    });

    await sendSidecarMessage({
      type: "claude:session:resume",
      payload: { sessionId, prompt },
    });
  },

  async abort(sessionId: string): Promise<void> {
    await sendSidecarMessage({
      type: "claude:session:abort",
      payload: { sessionId },
    });
  },
};
