/**
 * OpenCode adapter — wraps @opencode-ai/sdk for sidecar use.
 *
 * Supported message types:
 *   opencode:discover          — find running opencode instances
 *   opencode:session:list      — list sessions on an instance
 *   opencode:session:create    — create a new session
 *   opencode:session:prompt    — send a prompt (async, streams events)
 *   opencode:session:abort     — abort a running session
 *   opencode:mcp:inject        — inject an MCP server into a running instance
 *   opencode:events:subscribe  — subscribe to SSE stream (emits events back)
 */

import { emit } from "../index.js";

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

/** Active EventSource subscriptions keyed by baseUrl */
const activeSubscriptions = new Map<string, { close: () => void }>();

async function discover(): Promise<DiscoveredInstance[]> {
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

async function apiGet<T>(baseUrl: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) throw new Error(`OpenCode API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenCode API POST ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

function subscribeEvents(baseUrl: string): void {
  if (activeSubscriptions.has(baseUrl)) return;

  const es = new EventSource(`${baseUrl}/event`);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string) as unknown;
      emit("opencode:event", { baseUrl, data });
    } catch {
      // ignore parse errors
    }
  };

  es.onerror = () => {
    emit("opencode:disconnected", { baseUrl });
    activeSubscriptions.delete(baseUrl);
    es.close();
  };

  activeSubscriptions.set(baseUrl, { close: () => es.close() });
}

export async function opencodeAdapter(
  type: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  switch (type) {
    case "opencode:discover":
      return discover();

    case "opencode:session:list": {
      const { baseUrl } = payload as { baseUrl: string };
      return apiGet(baseUrl, "/session");
    }

    case "opencode:session:create": {
      const { baseUrl, title, parentID } = payload as {
        baseUrl: string;
        title?: string;
        parentID?: string;
      };
      return apiPost(baseUrl, "/session", { title, parentID });
    }

    case "opencode:session:prompt": {
      const { baseUrl, sessionId, parts, model } = payload as {
        baseUrl: string;
        sessionId: string;
        parts: unknown[];
        model?: unknown;
      };
      // Fire async — response streams back via SSE events
      apiPost(baseUrl, `/session/${sessionId}/prompt_async`, { parts, model }).catch((err) => {
        process.stderr.write(`[opencode] prompt_async error: ${err}\n`);
      });
      return { queued: true };
    }

    case "opencode:session:abort": {
      const { baseUrl, sessionId } = payload as { baseUrl: string; sessionId: string };
      return apiPost(baseUrl, `/session/${sessionId}/abort`, {});
    }

    case "opencode:mcp:inject": {
      const { baseUrl, name, config } = payload as {
        baseUrl: string;
        name: string;
        config: unknown;
      };
      return apiPost(baseUrl, "/mcp", { name, config });
    }

    case "opencode:events:subscribe": {
      const { baseUrl } = payload as { baseUrl: string };
      subscribeEvents(baseUrl);
      return { subscribed: true };
    }

    case "opencode:events:unsubscribe": {
      const { baseUrl } = payload as { baseUrl: string };
      activeSubscriptions.get(baseUrl)?.close();
      activeSubscriptions.delete(baseUrl);
      return { unsubscribed: true };
    }

    default:
      throw new Error(`opencode adapter: unknown type ${type}`);
  }
}
