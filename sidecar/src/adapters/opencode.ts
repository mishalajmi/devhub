/**
 * OpenCode sidecar driver.
 *
 * Uses @opencode-ai/sdk to spawn and own an `opencode serve` process per
 * DevHub agent session.  All HTTP and SSE communication goes through the
 * typed SDK client — no raw fetch or manual port scanning.
 *
 * Exported as a plain `AgentDriverWithRemoteSessions` object so that
 * driver-loader.ts can register it by checking `"opencodeDriver" in mod`.
 */

import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type {
  AgentDriverWithRemoteSessions,
  AgentStartOptions,
  AgentMessage,
  McpServerConfig,
  RemoteSession,
} from "@devhub/types";

// ─── Active session state ─────────────────────────────────────────────────────

interface OpenCodeActiveSession {
  /** Typed SDK client pointed at this session's server */
  client: ReturnType<typeof createOpencodeClient>;
  /** Handle to the spawned opencode process */
  server: { url: string; close(): void };
  /** The session ID assigned by the OpenCode server */
  externalSessionId: string;
  /** Absolute path to the project root (passed as `directory` query param) */
  projectRoot: string;
  /** Abort this to tear down the SSE stream */
  abortController: AbortController;
}

const activeSessions = new Map<string, OpenCodeActiveSession>();

// ─── SSE event → AgentMessage mapping ────────────────────────────────────────

function mapSdkEvent(
  devhubSessionId: string,
  raw: unknown,
): AgentMessage | null {
  const event = raw as { type: string; properties: Record<string, unknown> };
  const now = new Date().toISOString();

  switch (event.type) {
    case "message.part.updated": {
      const part = event.properties["part"] as Record<string, unknown> | undefined;
      if (!part) return null;
      const delta = event.properties["delta"] as string | undefined;

      if (part["type"] === "text") {
        return {
          kind: "text",
          id: (part["id"] as string) ?? crypto.randomUUID(),
          sessionId: devhubSessionId,
          role: "assistant",
          content: delta ?? (part["text"] as string) ?? "",
          timestamp: now,
        };
      }

      if (part["type"] === "tool") {
        return {
          kind: "tool_use",
          id: (part["id"] as string) ?? crypto.randomUUID(),
          sessionId: devhubSessionId,
          toolName: (part["tool"] as string) ?? "unknown",
          toolInput: {},
          timestamp: now,
        };
      }

      return null;
    }

    case "session.idle":
      return {
        kind: "system",
        id: crypto.randomUUID(),
        sessionId: devhubSessionId,
        event: "done",
        timestamp: now,
      };

    case "session.error": {
      const err = event.properties["error"] as
        | { data?: { message?: string } }
        | undefined;
      return {
        kind: "system",
        id: crypto.randomUUID(),
        sessionId: devhubSessionId,
        event: "error",
        detail: err?.data?.message ?? "OpenCode session error",
        timestamp: now,
      };
    }

    default:
      return null;
  }
}

// ─── SSE subscription ─────────────────────────────────────────────────────────

async function subscribeToSession(
  devhubSessionId: string,
  externalSessionId: string,
  client: ReturnType<typeof createOpencodeClient>,
  options: Pick<AgentStartOptions, "onMessage" | "onStatusChange" | "onError">,
  abortController: AbortController,
): Promise<void> {
  try {
    const { stream } = await client.event.subscribe({
      signal: abortController.signal,
    });

    for await (const sdkEvent of stream) {
      const event = sdkEvent as { type: string; properties: Record<string, unknown> };

      // Filter to events for this session only (where the event carries a sessionID)
      const eventSessionId = event.properties?.["sessionID"] as string | undefined;
      if (eventSessionId !== undefined && eventSessionId !== externalSessionId) {
        continue;
      }

      const msg = mapSdkEvent(devhubSessionId, sdkEvent);
      if (!msg) continue;

      options.onMessage(msg);

      if (msg.kind === "system" && msg.event === "done") {
        options.onStatusChange("idle");
      }
      if (msg.kind === "system" && msg.event === "error") {
        const detail = (msg as { detail?: string }).detail;
        options.onError(new Error(detail ?? "OpenCode session error"));
        options.onStatusChange("error");
      }
    }
  } catch (err) {
    if (abortController.signal.aborted) return; // normal teardown
    options.onError(err instanceof Error ? err : new Error(String(err)));
    options.onStatusChange("error");
  }
}

// ─── Shared start/resume logic ────────────────────────────────────────────────

async function attach(
  devhubSessionId: string,
  externalSessionId: string,
  server: { url: string; close(): void },
  projectRoot: string,
  mcpServers: McpServerConfig[],
  options: AgentStartOptions,
): Promise<void> {
  const client = createOpencodeClient({ baseUrl: server.url });
  const abortController = new AbortController();

  activeSessions.set(devhubSessionId, {
    client,
    server,
    externalSessionId,
    projectRoot,
    abortController,
  });

  // Inject MCP servers — errors are per-server, non-fatal
  for (const mcp of mcpServers) {
    await client.mcp
      .add({
        body: {
          name: mcp.name,
          config: {
            type: "local",
            command: [mcp.command, ...(mcp.args ?? [])],
            environment: (mcp.env as Record<string, string> | undefined) ?? {},
          },
        },
        query: { directory: projectRoot },
      })
      .catch((err: unknown) => {
        options.onError(
          new Error(
            `MCP inject failed for "${mcp.name}": ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      });
  }

  // Subscribe to SSE — fire-and-forget; events push into onMessage callbacks
  subscribeToSession(
    devhubSessionId,
    externalSessionId,
    client,
    options,
    abortController,
  ).catch((err: unknown) => {
    process.stderr.write(
      `[opencode-driver] SSE loop error for ${devhubSessionId}: ${err}\n`,
    );
  });

  options.onStatusChange("idle");
}

// ─── Driver ──────────────────────────────────────────────────────────────────

export const opencodeDriver: AgentDriverWithRemoteSessions = {
  id: "opencode",
  name: "OpenCode",
  description:
    "AI coding agent with full filesystem and tool access via opencode serve",
  supportsResume: true,
  supportsMcp: true,

  /**
   * Spawn a fresh OpenCode server process, create a session, wire SSE, inject MCP.
   */
  async start(options: AgentStartOptions): Promise<void> {
    const { session, projectRoot, mcpServers, onStatusChange, onError } =
      options;

    onStatusChange("initializing");

    let server: { url: string; close(): void };
    let client: ReturnType<typeof createOpencodeClient>;

    try {
      ({ client, server } = await createOpencode({ hostname: "127.0.0.1" }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to start OpenCode server: ${msg}. Is opencode installed and on PATH?`,
      );
    }

    try {
      const { data: created } = await client.session.create({
        body: { title: session.title ?? undefined },
        query: { directory: projectRoot },
      });

      if (!created) throw new Error("OpenCode server returned no session data");

      await attach(
        session.id,
        created.id,
        server,
        projectRoot,
        mcpServers,
        options,
      );
    } catch (err) {
      server.close();
      onError(err instanceof Error ? err : new Error(String(err)));
      onStatusChange("error");
    }
  },

  /**
   * Spawn a fresh server and re-attach to an existing OpenCode session by externalId.
   * OpenCode retains full session history server-side.
   */
  async resume(options: AgentStartOptions): Promise<void> {
    const { session, projectRoot, mcpServers, onStatusChange, onError } =
      options;

    if (!session.externalId) {
      throw new Error(
        `Cannot resume OpenCode session ${session.id}: no externalId stored`,
      );
    }

    onStatusChange("initializing");

    let server: { url: string; close(): void };

    try {
      ({ server } = await createOpencode({ hostname: "127.0.0.1" }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to start OpenCode server: ${msg}. Is opencode installed and on PATH?`,
      );
    }

    try {
      await attach(
        session.id,
        session.externalId,
        server,
        projectRoot,
        mcpServers,
        options,
      );
    } catch (err) {
      server.close();
      onError(err instanceof Error ? err : new Error(String(err)));
      onStatusChange("error");
    }
  },

  /**
   * Tear down the SSE stream and kill the spawned OpenCode process.
   */
  async stop(sessionId: string): Promise<void> {
    const state = activeSessions.get(sessionId);
    if (!state) return;

    state.abortController.abort();
    state.server.close();
    activeSessions.delete(sessionId);
  },

  /**
   * Send a user prompt to the active session via prompt_async.
   */
  async send(sessionId: string, prompt: string): Promise<void> {
    const state = activeSessions.get(sessionId);
    if (!state) throw new Error(`No active OpenCode session: ${sessionId}`);

    await state.client.session.promptAsync({
      path: { id: state.externalSessionId },
      body: { parts: [{ type: "text", text: prompt }] },
      query: { directory: state.projectRoot },
    });
  },

  /**
   * Abort the currently running prompt on the session.
   */
  async abort(sessionId: string): Promise<void> {
    const state = activeSessions.get(sessionId);
    if (!state) return;

    await state.client.session.abort({
      path: { id: state.externalSessionId },
    }).catch(() => {
      // best-effort — session may have already finished
    });
  },

  /**
   * Return the base URL of the spawned OpenCode server for this session.
   */
  getBaseUrl(sessionId: string): string | null {
    return activeSessions.get(sessionId)?.server.url ?? null;
  },

  /**
   * Dynamically inject an MCP server into the running OpenCode instance.
   */
  async injectMcp(sessionId: string, server: McpServerConfig): Promise<void> {
    const state = activeSessions.get(sessionId);
    if (!state) throw new Error(`No active OpenCode session: ${sessionId}`);

    await state.client.mcp.add({
      body: {
        name: server.name,
        config: {
          type: "local",
          command: [server.command, ...(server.args ?? [])],
          environment: (server.env as Record<string, string> | undefined) ?? {},
        },
      },
      query: { directory: state.projectRoot },
    });
  },

  /**
   * With the spawn model DevHub owns each server — there are no pre-existing
   * remote sessions to discover.  Returns an empty list.
   * (If attach-to-user-run-instance is added later, port scanning goes here.)
   */
  async listRemoteSessions(_projectId: string): Promise<RemoteSession[]> {
    return [];
  },
};
