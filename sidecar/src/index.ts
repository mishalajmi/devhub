/**
 * DevHub Node.js sidecar — IPC bridge.
 *
 * Communication protocol with the Tauri backend:
 * - Tauri → sidecar: newline-delimited JSON on stdin
 * - Sidecar → Tauri: newline-delimited JSON on stdout
 * - Stderr: logs only (never parsed by Tauri)
 *
 * Message envelope:
 *   { id: string, type: string, payload: unknown }
 *
 * Response envelope:
 *   { id: string, ok: true, result: unknown }
 *   { id: string, ok: false, error: string }
 */

import {
  loadBuiltinDrivers,
  loadLocalDriver,
  loadLocalDriversFromDir,
} from "./driver-loader.js";
import { Registry } from "./agent-registry";
import type {
  AgentSession,
  AgentStartOptions,
  AgentType,
  DriverDispatchMessage,
  DriverDispatchResult,
} from "@devhub/types";
import { isDriverWithRemoteSessions } from "@devhub/types";
import { AgentCapabilityNotSupported } from "@devhub/errors";

type IncomingMessage = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};

type OutgoingMessage =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

/** Write a response line to stdout */
function send(msg: OutgoingMessage): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

/** Emit a streaming event (no request ID — fire and forget to Tauri event system) */
export function emit(type: string, payload: unknown): void {
  process.stdout.write(JSON.stringify({ event: type, payload }) + "\n");
}

/** Route an incoming message to the appropriate adapter */
async function handle(msg: IncomingMessage): Promise<void> {
  try {
    let result: unknown;

    if (msg.type.startsWith("driver:")) {
      result = await handleDriverDispatch(msg as unknown as DriverDispatchMessage);
    } else if (msg.type.startsWith("drivers:")) {
      result = await handleDrivers(msg.type, msg.payload);
    } else {
      throw new Error(`Unknown message type: ${msg.type}`);
    }

    send({ id: msg.id, ok: true, result });
  } catch (err) {
    send({
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Handle driver management messages */
async function handleDrivers(
  type: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  switch (type) {
    case "drivers:list":
      return Registry.listManifests();

    case "drivers:load": {
      const { path: filePath } = payload as { path: string };
      if (!filePath || typeof filePath !== "string") {
        throw new Error("drivers:load requires a non-empty string `path` field");
      }
      return loadLocalDriver(filePath);
    }

    case "drivers:load-dir": {
      const { dir } = payload as { dir?: string };
      return loadLocalDriversFromDir(dir);
    }

    case "drivers:unregister": {
      const { id } = payload as { id: string };
      if (!id || typeof id !== "string") {
        throw new Error("drivers:unregister requires a non-empty string `id` field");
      }
      Registry.unregisterDriver(id);
      return { unregistered: true };
    }

    default:
      throw new Error(`Unknown drivers message type: ${type}`);
  }
}

async function handleDriverDispatch(
  msg: DriverDispatchMessage,
): Promise<DriverDispatchResult> {
  const { driverId } = msg.payload;
  const driver = Registry.getDriver(driverId);

  switch (msg.type) {
    case "driver:start":
    case "driver:resume": {
      const { sessionId, projectId, projectRoot, mcpServers, title } = msg.payload;
      const externalId = msg.type === "driver:resume" ? msg.payload.externalId : undefined;

      const session: AgentSession = {
        id: sessionId,
        projectId,
        agentType: driverId as AgentType,
        externalId: externalId ?? null,
        status: "initializing",
        title: title ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const options: AgentStartOptions = {
        session,
        projectRoot,
        mcpServers: mcpServers ?? [],
        onMessage:      (m)      => emit("driver:message", { driverId, sessionId, message: m }),
        onStatusChange: (status) => emit("driver:status",  { driverId, sessionId, status }),
        onError:        (err)    => emit("driver:error",   { driverId, sessionId, error: err.message }),
      };

      const fn = msg.type === "driver:resume"
        ? driver.resume.bind(driver)
        : driver.start.bind(driver);

      fn(options).catch((err: unknown) =>
        emit("driver:error", { driverId, sessionId, error: String(err) }),
      );

      return { started: true, sessionId };
    }

    case "driver:stop": {
      const { sessionId } = msg.payload;
      await driver.stop(sessionId);
      return { stopped: true };
    }

    case "driver:send": {
      const { sessionId, prompt } = msg.payload;
      await driver.send(sessionId, prompt);
      return { sent: true };
    }

    case "driver:abort": {
      const { sessionId } = msg.payload;
      await driver.abort(sessionId);
      return { aborted: true };
    }

    case "driver:inject-mcp": {
      const { sessionId, server } = msg.payload;
      if (!driver.injectMcp) throw new AgentCapabilityNotSupported("mcp injection");
      await driver.injectMcp(sessionId, server);
      return { injected: true };
    }

    case "driver:list-sessions": {
      const { projectId } = msg.payload;
      if (!isDriverWithRemoteSessions(driver))
        throw new AgentCapabilityNotSupported("listing remote sessions");
      return driver.listRemoteSessions(projectId);
    }
  }
}

/** Read newline-delimited JSON from stdin */
function startStdinLoop(): void {
  let buffer = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as IncomingMessage;
        handle(msg).catch((err) => {
          process.stderr.write(`[sidecar] unhandled error: ${err}\n`);
        });
      } catch {
        process.stderr.write(`[sidecar] failed to parse message: ${trimmed}\n`);
      }
    }
  });

  process.stdin.on("end", () => {
    process.stderr.write("[sidecar] stdin closed, exiting\n");
    process.exit(0);
  });
}

process.stderr.write("[sidecar] DevHub sidecar started\n");

// Load built-in drivers then scan ~/.devhub/drivers/ for user drivers.
// Both are fire-and-forget — failures are logged, not fatal.
loadBuiltinDrivers()
  .then(() => loadLocalDriversFromDir())
  .catch((err) => {
    process.stderr.write(`[sidecar] driver init error: ${err}\n`);
  });

startStdinLoop();
