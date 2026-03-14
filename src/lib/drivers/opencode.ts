/**
 * OpenCode frontend driver shim.
 *
 * Implements AgentDriverWithRemoteSessions by proxying every method call to
 * the sidecar via sendSidecarMessage / onSidecarEvent.  No OpenCode SDK code
 * runs in the frontend — all HTTP/SSE logic lives in the sidecar adapter.
 *
 * sendSidecarMessage is fire-and-forget (returns void).  For calls that need
 * a response (session:create, discover, session:list) we listen for a
 * correlating sidecar://event matched by correlationId.
 *
 * Sidecar message types sent:
 *   opencode:session:create      — create a session; sidecar emits opencode:session:created
 *   opencode:session:prompt      — send a prompt; streams back via opencode:event
 *   opencode:session:abort       — abort an in-progress response
 *   opencode:events:subscribe    — start forwarding SSE events to stdout
 *   opencode:events:unsubscribe  — stop forwarding SSE events
 *   opencode:mcp:inject          — inject an MCP server into a running instance
 *   opencode:session:list        — list sessions; sidecar emits opencode:sessions:listed
 *   opencode:discover            — find instances; sidecar emits opencode:discovered
 *
 * Sidecar events received (via sidecar://event):
 *   { event: "opencode:event",           payload: { baseUrl, data } }
 *   { event: "opencode:session:created", payload: { correlationId, id, baseUrl } }
 *   { event: "opencode:discovered",      payload: { correlationId, instances } }
 *   { event: "opencode:sessions:listed", payload: { correlationId, sessions } }
 */

import type {
  AgentDriverWithRemoteSessions,
  AgentStartOptions,
  AgentMessage,
  RemoteSession,
  RemoteSessionState,
} from "@devhub/types";
import type { McpServerConfig } from "@devhub/types";
import { sendSidecarMessage, onSidecarEvent } from "@/lib/tauri";

const sessions = new Map<string, RemoteSessionState>();

// ─── One-shot response helper ─────────────────────────────────────────────────

/**
 * Send a fire-and-forget sidecar message that includes a correlationId, then
 * wait for a matching sidecar://event response keyed by that same id.
 * Times out after `timeoutMs` milliseconds.
 */
function sendAndWait<T>(
  message: { type: string; payload: Record<string, unknown> },
  responseEvent: string,
  timeoutMs = 10_000,
): Promise<T> {
  const correlationId = crypto.randomUUID();

  return new Promise<T>((resolve, reject) => {
    let unlisten: (() => void) | undefined;

    const timer = setTimeout(() => {
      unlisten?.();
      reject(new Error(`Timed out waiting for "${responseEvent}"`));
    }, timeoutMs);

    onSidecarEvent((raw) => {
      const envelope = raw as Record<string, unknown>;
      if (envelope["event"] !== responseEvent) return;
      const payload = envelope["payload"] as Record<string, unknown>;
      if (payload["correlationId"] !== correlationId) return;

      clearTimeout(timer);
      unlisten?.();
      resolve(payload as T);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(reject);

    sendSidecarMessage({
      ...message,
      payload: { ...message.payload, correlationId },
    }).catch((err: unknown) => {
      clearTimeout(timer);
      unlisten?.();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

// ─── SSE event → AgentMessage mapping ────────────────────────────────────────

function mapEvent(
  sessionId: string,
  data: Record<string, unknown>,
): AgentMessage | null {
  const now = new Date().toISOString();

  switch (data["type"] as string) {
    case "assistant.message.created":
      return {
        kind: "text",
        id: (data["id"] as string) ?? crypto.randomUUID(),
        sessionId,
        role: "assistant",
        content: "",
        timestamp: now,
      };

    case "assistant.message.delta":
      return {
        kind: "text",
        id: (data["id"] as string) ?? crypto.randomUUID(),
        sessionId,
        role: "assistant",
        content: (data["content"] as string) ?? "",
        timestamp: now,
      };

    case "assistant.message.stop":
      return {
        kind: "system",
        id: crypto.randomUUID(),
        sessionId,
        event: "done",
        timestamp: now,
      };

    case "tool.use":
      return {
        kind: "tool_use",
        id: (data["id"] as string) ?? crypto.randomUUID(),
        sessionId,
        toolName: (data["tool"] as string) ?? "unknown",
        toolInput: data["input"] ?? {},
        timestamp: now,
      };

    case "tool.result":
      return {
        kind: "tool_result",
        id: (data["id"] as string) ?? crypto.randomUUID(),
        sessionId,
        toolName: (data["tool"] as string) ?? "unknown",
        toolOutput: data["output"] ?? null,
        isError: (data["isError"] as boolean) ?? false,
        timestamp: now,
      };

    case "session.error":
      return {
        kind: "system",
        id: crypto.randomUUID(),
        sessionId,
        event: "error",
        detail: (data["error"] as string) ?? "unknown error",
        timestamp: now,
      };

    case "server.heartbeat":
      return {
        kind: "system",
        id: crypto.randomUUID(),
        sessionId,
        event: "heartbeat",
        timestamp: now,
      };

    default:
      return null;
  }
}

// ─── Shim implementation ──────────────────────────────────────────────────────

export const opencodeDriverShim: AgentDriverWithRemoteSessions = {
  id: "opencode",
  name: "OpenCode",
  description:
    "AI coding agent with full filesystem and tool access via opencode serve",
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

    // Ask the sidecar to create a session on the opencode server and wait for
    // the response event which carries the resolved baseUrl.
    const created = await sendAndWait<{ id: string; baseUrl: string }>(
      {
        type: "opencode:session:create",
        payload: { projectRoot, title: session.title ?? undefined },
      },
      "opencode:session:created",
    );

    const { baseUrl } = created;

    // Start forwarding SSE events from this opencode instance to the sidecar
    // stdout so they flow through as sidecar://event payloads.
    await sendSidecarMessage({
      type: "opencode:events:subscribe",
      payload: { baseUrl },
    });

    // Subscribe to sidecar://event and route opencode events for this session.
    const unlisten = await onSidecarEvent((raw) => {
      const envelope = raw as Record<string, unknown>;
      if (envelope["event"] !== "opencode:event") return;

      const inner = envelope["payload"] as Record<string, unknown>;
      if ((inner["baseUrl"] as string) !== baseUrl) return;

      const data = inner["data"] as Record<string, unknown>;
      // SSE events carry the session ID in either camelCase or snake_case.
      const evtSession = (data["sessionID"] ?? data["sessionId"]) as
        | string
        | undefined;
      if (evtSession !== session.id) return;

      const msg = mapEvent(session.id, data);
      if (!msg) return;

      onMessage(msg);

      if (
        msg.kind === "system" &&
        (msg.event === "done" || msg.event === "error")
      ) {
        onStatusChange("idle");
      }
    });

    sessions.set(session.id, { baseUrl, unlisten });

    // Inject any project MCP servers into the running instance.
    for (const server of mcpServers) {
      await sendSidecarMessage({
        type: "opencode:mcp:inject",
        payload: { baseUrl, name: server.name, config: server },
      }).catch((err: unknown) => {
        onError(err instanceof Error ? err : new Error(String(err)));
      });
    }

    onStatusChange("idle");
  },

  async resume(options: AgentStartOptions): Promise<void> {
    // OpenCode sessions persist on the server; resuming re-attaches listeners
    // using the stored externalId — the flow is identical to start.
    return opencodeDriverShim.start(options);
  },

  async stop(sessionId: string): Promise<void> {
    const state = sessions.get(sessionId);
    if (!state) return;

    await sendSidecarMessage({
      type: "opencode:events:unsubscribe",
      payload: { baseUrl: state.baseUrl },
    });

    state.unlisten();
    sessions.delete(sessionId);
  },

  async send(sessionId: string, prompt: string): Promise<void> {
    const state = sessions.get(sessionId);
    if (!state) throw new Error(`No active OpenCode session: ${sessionId}`);

    await sendSidecarMessage({
      type: "opencode:session:prompt",
      payload: {
        baseUrl: state.baseUrl,
        sessionId,
        parts: [{ type: "text", text: prompt }],
      },
    });
  },

  async abort(sessionId: string): Promise<void> {
    const state = sessions.get(sessionId);
    if (!state) return;

    await sendSidecarMessage({
      type: "opencode:session:abort",
      payload: { baseUrl: state.baseUrl, sessionId },
    });
  },

  getBaseUrl(sessionId: string): string | null {
    return sessions.get(sessionId)?.baseUrl ?? null;
  },

  async injectMcp(sessionId: string, server: McpServerConfig): Promise<void> {
    const state = sessions.get(sessionId);
    if (!state) throw new Error(`No active OpenCode session: ${sessionId}`);

    await sendSidecarMessage({
      type: "opencode:mcp:inject",
      payload: { baseUrl: state.baseUrl, name: server.name, config: server },
    });
  },

  async listRemoteSessions(_projectId: string): Promise<RemoteSession[]> {
    // Discover running opencode instances.
    const { instances } = await sendAndWait<{
      instances: Array<{ baseUrl: string }>;
    }>({ type: "opencode:discover", payload: {} }, "opencode:discovered");

    if (!Array.isArray(instances) || instances.length === 0) return [];

    // List sessions from each instance in parallel.
    const settled = await Promise.allSettled(
      instances.map((inst) =>
        sendAndWait<{
          sessions: Array<{ id: string; title?: string; createdAt: string }>;
        }>(
          {
            type: "opencode:session:list",
            payload: { baseUrl: inst.baseUrl },
          },
          "opencode:sessions:listed",
        ),
      ),
    );

    return settled
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<{
          sessions: Array<{ id: string; title?: string; createdAt: string }>;
        }> => r.status === "fulfilled",
      )
      .flatMap((r) =>
        r.value.sessions.map((s) => ({
          externalId: s.id,
          title: s.title,
          createdAt: s.createdAt,
          raw: s,
        })),
      );
  },
};
