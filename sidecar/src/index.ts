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

import { opencodeAdapter } from "./adapters/opencode.js";
import { claudeAdapter } from "./adapters/claude.js";

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

    if (msg.type.startsWith("opencode:")) {
      result = await opencodeAdapter(msg.type, msg.payload);
    } else if (msg.type.startsWith("claude:")) {
      result = await claudeAdapter(msg.type, msg.payload, msg.id);
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
startStdinLoop();
