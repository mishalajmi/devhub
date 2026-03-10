/**
 * OpenCode HTTP/SSE client wrapper.
 * Wraps @opencode-ai/sdk for use within the frontend.
 * Session state is owned by the OpenCode server — we never duplicate it.
 */

const DISCOVERY_PORTS = Array.from({ length: 100 }, (_, i) => 4096 + i);

interface OpenCodeHealth {
  healthy: boolean;
  version: string;
}

interface DiscoveredInstance {
  port: number;
  baseUrl: string;
  version: string;
}

/**
 * Discover running OpenCode instances by probing the well-known port range.
 * Returns all found instances sorted by port ascending.
 */
export async function discoverOpenCodeInstances(): Promise<DiscoveredInstance[]> {
  const results = await Promise.allSettled(
    DISCOVERY_PORTS.map(async (port) => {
      const baseUrl = `http://127.0.0.1:${port}`;
      const res = await fetch(`${baseUrl}/global/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (!res.ok) throw new Error("not ok");
      const data = (await res.json()) as OpenCodeHealth;
      if (!data.healthy) throw new Error("not healthy");
      return { port, baseUrl, version: data.version };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<DiscoveredInstance> => r.status === "fulfilled")
    .map((r) => r.value)
    .sort((a, b) => a.port - b.port);
}

/**
 * Create a typed fetch wrapper for a specific OpenCode instance.
 * This is a thin wrapper — heavy lifting is done by the full SDK in the sidecar.
 * The frontend only needs list/read operations; write operations go through the sidecar.
 */
export function createOpenCodeClient(baseUrl: string) {
  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) throw new Error(`OpenCode API error: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  return {
    health: () => get<OpenCodeHealth>("/global/health"),
    listSessions: () => get<unknown[]>("/session"),
    getSession: (id: string) => get<unknown>(`/session/${id}`),
    listMessages: (sessionId: string) => get<unknown[]>(`/session/${sessionId}/message`),
    listAgents: () => get<unknown[]>("/agent"),
    getMcpStatus: () => get<Record<string, unknown>>("/mcp"),

    /**
     * Subscribe to the global SSE event stream.
     * Returns an EventSource — caller is responsible for closing it.
     */
    subscribeEvents: (): EventSource => {
      return new EventSource(`${baseUrl}/event`);
    },
  };
}

export type OpenCodeClient = ReturnType<typeof createOpenCodeClient>;
