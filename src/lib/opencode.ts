/**
 * OpenCode HTTP/SSE client wrapper.
 * All HTTP communication with OpenCode server instances goes through this module.
 * No raw fetch() calls are permitted in components or hooks.
 *
 * Session state is owned by the OpenCode server — DevHub reads it, never duplicates it.
 */

import { logger } from "@/lib/logger";
import type { OpenCodeInstance, OpenCodeSession } from "@/types/agent";

/** Port range to scan for running OpenCode instances (inclusive) */
const OPENCODE_PORT_MIN = 4096;
const OPENCODE_PORT_MAX = 4196;
const OPENCODE_DISCOVERY_PORTS = Array.from(
  { length: OPENCODE_PORT_MAX - OPENCODE_PORT_MIN + 1 },
  (_, i) => OPENCODE_PORT_MIN + i
);

/** Timeout for health-check probes in milliseconds */
const HEALTH_CHECK_TIMEOUT_MS = 500;

interface OpenCodeHealthResponse {
  healthy: boolean;
  version: string;
}

// ─── Low-level helpers ────────────────────────────────────────────────────────

async function apiGet<T>(baseUrl: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) {
    throw new Error(`OpenCode GET ${path}: HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OpenCode POST ${path}: HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiDelete(baseUrl: string, path: string): Promise<void> {
  const res = await fetch(`${baseUrl}${path}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`OpenCode DELETE ${path}: HTTP ${res.status}`);
  }
}

// ─── Discovery ────────────────────────────────────────────────────────────────

/**
 * Probe a single port. Returns an OpenCodeInstance if healthy, null otherwise.
 * Every possible failure is swallowed here — this function NEVER throws.
 */
async function probePort(port: number): Promise<OpenCodeInstance | null> {
  try {
    const baseUrl = `http://127.0.0.1:${port}`;

    // Build an AbortController manually so we work on all WebView versions.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/global/health`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return null;

    const data = (await res.json()) as OpenCodeHealthResponse;
    if (!data.healthy) return null;

    return { port, baseUrl, version: data.version ?? "unknown", healthy: true };
  } catch {
    // Connection refused, timeout, parse error — all are expected for closed ports.
    return null;
  }
}

/**
 * Scan the well-known port range for running OpenCode instances.
 * Returns all healthy instances sorted by port ascending.
 * Never throws — returns [] on any unexpected error.
 */
export async function discoverInstances(): Promise<OpenCodeInstance[]> {
  try {
    const probes = await Promise.allSettled(
      OPENCODE_DISCOVERY_PORTS.map((port) => probePort(port))
    );

    const instances = probes
      .filter(
        (r): r is PromiseFulfilledResult<OpenCodeInstance> =>
          r.status === "fulfilled" && r.value !== null
      )
      .map((r) => r.value)
      .sort((a, b) => a.port - b.port);

    logger.info("opencode", "Discovery complete", { found: instances.length });
    return instances;
  } catch {
    logger.warn("opencode", "Discovery failed unexpectedly", {});
    return [];
  }
}

/**
 * @deprecated Use `discoverInstances` instead.
 * Kept for backwards compat with code that imported the old name.
 */
export const discoverOpenCodeInstances = discoverInstances;

// ─── Sessions ─────────────────────────────────────────────────────────────────

/**
 * List all sessions known to an OpenCode instance.
 */
export async function listSessions(baseUrl: string): Promise<OpenCodeSession[]> {
  return apiGet<OpenCodeSession[]>(baseUrl, "/session");
}

/**
 * Create a new session on an OpenCode instance.
 * Optionally sets a title.
 */
export async function createSession(
  baseUrl: string,
  _projectId: string,
  title?: string
): Promise<OpenCodeSession> {
  return apiPost<OpenCodeSession>(baseUrl, "/session", { title });
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

/**
 * Send a prompt to a session asynchronously.
 * The actual response arrives via the SSE event stream — this call returns immediately.
 */
export async function sendPrompt(
  baseUrl: string,
  sessionId: string,
  prompt: string
): Promise<void> {
  await apiPost<unknown>(baseUrl, `/session/${sessionId}/prompt_async`, {
    parts: [{ type: "text", text: prompt }],
  });
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

/**
 * Abort a running session.
 */
export async function abortSession(baseUrl: string, sessionId: string): Promise<void> {
  try {
    await apiPost<unknown>(baseUrl, `/session/${sessionId}/abort`, {});
  } catch (err) {
    logger.warn("opencode", "abortSession failed", { sessionId, error: String(err) });
  }
}

/**
 * Delete a session from the OpenCode server.
 */
export async function deleteSession(baseUrl: string, sessionId: string): Promise<void> {
  await apiDelete(baseUrl, `/session/${sessionId}`);
}

// ─── SSE event stream ─────────────────────────────────────────────────────────

export interface OpenCodeEvent {
  type: string;
  sessionId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

/**
 * Subscribe to the global SSE event stream for an OpenCode instance.
 * Calls `onEvent` for every parsed event. Filters to `sessionId` if provided.
 * Returns an unsubscribe function — call it on cleanup.
 */
export function subscribeToEvents(
  baseUrl: string,
  sessionId: string | null,
  onEvent: (event: OpenCodeEvent) => void
): () => void {
  const es = new EventSource(`${baseUrl}/event`);

  es.onmessage = (raw) => {
    try {
      const parsed = JSON.parse(raw.data as string) as OpenCodeEvent;
      if (sessionId && parsed.sessionId && parsed.sessionId !== sessionId) return;
      onEvent(parsed);
    } catch {
      // ignore unparseable frames
    }
  };

  es.onerror = () => {
    logger.warn("opencode", "SSE stream error", { baseUrl, sessionId });
  };

  return () => {
    es.close();
    logger.info("opencode", "SSE stream closed", { baseUrl, sessionId });
  };
}

// ─── Legacy client factory (kept for backwards compat) ────────────────────────

/**
 * @deprecated Build ad-hoc clients via the named functions instead.
 */
export function createOpenCodeClient(baseUrl: string) {
  return {
    health: () => apiGet<OpenCodeHealthResponse>(baseUrl, "/global/health"),
    listSessions: () => listSessions(baseUrl),
    getSession: (id: string) => apiGet<OpenCodeSession>(baseUrl, `/session/${id}`),
    listMessages: (sid: string) => apiGet<unknown[]>(baseUrl, `/session/${sid}/message`),
    listAgents: () => apiGet<unknown[]>(baseUrl, "/agent"),
    getMcpStatus: () => apiGet<Record<string, unknown>>(baseUrl, "/mcp"),
    subscribeEvents: (): EventSource => new EventSource(`${baseUrl}/event`),
  };
}

export type OpenCodeClient = ReturnType<typeof createOpenCodeClient>;
