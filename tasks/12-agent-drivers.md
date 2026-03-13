# Feature: Agent Driver Abstraction

## Branch: `feat/agent-drivers`

## Context

Chunks 11 and 12 implemented OpenCode and Claude adapters directly against their
respective transports (HTTP/SSE and sidecar IPC). Before building the session
manager UI (chunk 13) and terminal panels (chunk 14), we need a generic
`AgentDriver` abstraction so the UI is decoupled from any specific agent. This
also enables a config-driven plugin system where users can load custom drivers
from disk.

**Execution order: 43 → 44 → 45 → 13 → 14**

---

## Chunk 43 — AgentDriver Contract + Registry + Plugin Loader

### `src/types/agent-driver.ts`

```ts
import type { AgentSession, McpServerConfig } from "@/types/agent";
import type { Project } from "@/types/project";

// ─── AgentMessage union ───────────────────────────────────────────────────────

export type AgentMessage =
  | {
      kind: "text";
      id: string;
      sessionId: string;
      role: "assistant" | "user";
      content: string;
      timestamp: string;
      metadata?: { model?: string; tokens?: { input: number; output: number } };
    }
  | {
      kind: "tool_use";
      id: string;
      sessionId: string;
      toolName: string;
      toolInput: unknown;
      timestamp: string;
    }
  | {
      kind: "tool_result";
      id: string;
      sessionId: string;
      toolName: string;
      toolOutput: unknown;
      isError: boolean;
      timestamp: string;
    }
  | {
      kind: "system";
      id: string;
      sessionId: string;
      event: "init" | "done" | "error" | "heartbeat";
      detail?: string;
      timestamp: string;
    };

// ─── Session status ───────────────────────────────────────────────────────────

export type SessionStatus =
  | "initializing"
  | "idle"
  | "running"
  | "error"
  | "stopped";

// ─── Driver start options ─────────────────────────────────────────────────────

export interface AgentStartOptions {
  session: AgentSession;
  project: Project;
  mcpServers: McpServerConfig[];
  onMessage: (msg: AgentMessage) => void;
  onStatusChange: (status: SessionStatus) => void;
  onError: (err: Error) => void;
}

// ─── Core driver interface ────────────────────────────────────────────────────

export interface AgentDriver {
  /** Unique identifier — must match agent_type stored in SQLite */
  readonly id: string;
  /** Human-readable name shown in the UI */
  readonly name: string;
  /** Short description shown in the new-session dialog */
  readonly description: string;
  /** Whether this driver can resume sessions across app restarts via externalId */
  readonly supportsResume: boolean;
  /** Whether this driver accepts MCP server injection at session start */
  readonly supportsMcp: boolean;

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  /** Start a brand-new session. Must call onStatusChange("initializing") then "idle". */
  start(options: AgentStartOptions): Promise<void>;
  /** Resume an existing session using session.externalId. */
  resume(options: AgentStartOptions): Promise<void>;
  /** Gracefully stop the session and release resources. */
  stop(sessionId: string): Promise<void>;

  // ── Communication ───────────────────────────────────────────────────────────
  /** Send a prompt. Driver calls onMessage() for each response chunk/event. */
  send(sessionId: string, prompt: string): Promise<void>;
  /** Abort an in-progress response. Does not stop the session. */
  abort(sessionId: string): Promise<void>;

  // ── Optional capabilities ───────────────────────────────────────────────────
  /** Return the HTTP base URL of the agent server, if applicable. */
  getBaseUrl?(sessionId: string): string | null;
  /** Inject an MCP server into a running session (if supportsMcp is true). */
  injectMcp?(sessionId: string, server: McpServerConfig): Promise<void>;
}

// ─── Extended interface for agents with a remote session list ─────────────────

export interface AgentDriverWithRemoteSessions extends AgentDriver {
  /**
   * List sessions known to the remote agent server.
   * Used to reconcile with DevHub's SQLite records on app start.
   */
  listRemoteSessions(projectId: string): Promise<RemoteSession[]>;
}

export interface RemoteSession {
  /** Session ID in the agent's own system (maps to agent_sessions.external_id) */
  externalId: string;
  title?: string;
  createdAt: string;
  /** Raw data from the agent — driver-specific */
  raw?: unknown;
}

// ─── Driver manifest ──────────────────────────────────────────────────────────

export interface AgentDriverManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  /** "builtin" drivers ship with DevHub; "local" are loaded from disk by the user */
  source: "builtin" | "local";
  /** Absolute path to the driver file — only set for local drivers */
  path?: string;
  supportsResume: boolean;
  supportsMcp: boolean;
  hasRemoteSessions: boolean;
}

// ─── Type guard ───────────────────────────────────────────────────────────────

export function isDriverWithRemoteSessions(
  driver: AgentDriver
): driver is AgentDriverWithRemoteSessions {
  return "listRemoteSessions" in driver;
}
```

### `src/lib/agent-registry.ts`

- Singleton `Map<string, { manifest: AgentDriverManifest; driver: AgentDriver }>`
- `registerDriver(manifest, driver)` — throws if id already registered
- `getDriver(id): AgentDriver` — throws `DriverNotFoundError` if missing
- `listManifests(): AgentDriverManifest[]` — all registered drivers sorted by name
- `unregisterDriver(id)` — for hot-reloading local drivers
- Built-in drivers are registered here at module init time (after chunk 44 + 45 ship)

### `sidecar/src/driver-loader.ts`

- `loadBuiltinDrivers()` — imports and registers `opencode` and `claude` drivers
- `loadLocalDriver(filePath: string): Promise<AgentDriverManifest>`:
  - Dynamic `import(filePath)` 
  - Validates export has `id`, `name`, `start`, `stop`, `send`, `abort` — throws descriptive error if not
  - Registers with `source: "local"`
  - Returns the manifest
- `loadLocalDriversFromDir(dir: string)` — reads `~/.devhub/drivers/`, calls `loadLocalDriver` for each `.ts`/`.js` file, logs errors per-file without crashing
- `unloadLocalDriver(id)` — calls `unregisterDriver`, optionally GC the module

### `src/lib/tauri.ts` additions

```ts
/** List all registered agent driver manifests */
export const listDriverManifests = (): Promise<AgentDriverManifest[]> =>
  invoke("list_driver_manifests");

/** Load a local driver from an absolute file path */
export const loadLocalDriver = (path: string): Promise<AgentDriverManifest> =>
  invoke("load_local_driver", { path });
```

### `src-tauri/src/commands/agent.rs` additions

- `list_driver_manifests` — sends `drivers:list` message to sidecar, returns parsed manifests
- `load_local_driver(path)` — sends `drivers:load { path }` to sidecar, returns manifest

### Sidecar IPC additions (`sidecar/src/index.ts`)

Handle message types:
- `drivers:list` → calls `listManifests()`, writes response to stdout
- `drivers:load { path }` → calls `loadLocalDriver(path)`, writes manifest to stdout

### Verify

- `bun run typecheck` zero errors
- `bun run lint` zero errors  
- `listManifests()` returns built-in drivers in correct shape
- Local driver loaded from a test file appears in `listManifests()`
- Loading a file that doesn't export a valid `AgentDriver` returns a descriptive error

---

## Chunk 44 — OpenCode Driver (Rust spawn + SDK client)

### `src-tauri/src/services/agent_process.rs` (new)

```rust
/// Manages spawned agent server processes.
pub struct AgentProcessManager {
    processes: Arc<Mutex<HashMap<String, AgentProcess>>>,
}

pub struct AgentProcess {
    pub session_id: String,
    pub base_url: String,
    pub child: std::process::Child,
}
```

- `spawn_opencode(app, session_id, project_root) -> anyhow::Result<String>`:
  - Spawns `opencode serve --hostname 127.0.0.1 --port 4096` via `std::process::Command`
  - Captures stdout via `Stdio::piped()`
  - Reads lines until regex `/listening on (https?:\/\/[^\s]+)/` matches
  - Extracts baseUrl from capture group
  - On Windows: assigns process to a Job Object so it dies with the parent
  - Registers in `processes` map
  - Emits `agent://opencode-ready { sessionId, baseUrl }` Tauri event
  - Spawns watchdog thread: on exit → emits `agent://process-crashed { sessionId }`, waits 1s, calls `spawn_opencode` again (one retry only)
  - Returns baseUrl

- `stop_opencode(session_id) -> anyhow::Result<()>`:
  - Looks up process, calls `child.kill()`, removes from map
  - Emits `agent://process-stopped { sessionId }`

- `list_processes() -> Vec<AgentProcessInfo>` — for status bar / debugging

### `src-tauri/src/commands/agent.rs` additions

- `spawn_opencode_server(session_id, project_root)` — delegates to `agent_process::spawn_opencode`
- `stop_opencode_server(session_id)` — delegates to `agent_process::stop_opencode`

### `src/lib/tauri.ts` additions

```ts
export const spawnOpencodeServer = (sessionId: string, projectRoot: string): Promise<string> =>
  invoke("spawn_opencode_server", { sessionId, projectRoot });

export const stopOpencodeServer = (sessionId: string): Promise<void> =>
  invoke("stop_opencode_server", { sessionId });

export const onOpencodeReady = (
  cb: (payload: { sessionId: string; baseUrl: string }) => void
): Promise<UnlistenFn> => listen("agent://opencode-ready", (e) => cb(e.payload as never));

export const onProcessCrashed = (
  cb: (payload: { sessionId: string }) => void
): Promise<UnlistenFn> => listen("agent://process-crashed", (e) => cb(e.payload as never));
```

### `sidecar/src/drivers/opencode.ts` (replaces `adapters/opencode.ts`)

Implements `AgentDriverWithRemoteSessions`:

```ts
import { createOpencodeClient } from "@opencode-ai/sdk";

export const opencodeDriver: AgentDriverWithRemoteSessions = {
  id: "opencode",
  name: "OpenCode",
  description: "AI coding agent with full filesystem and tool access via opencode serve",
  supportsResume: true,
  supportsMcp: true,

  async start(options) { ... },
  async resume(options) { ... },
  async stop(sessionId) { ... },
  async send(sessionId, prompt) { ... },
  async abort(sessionId) { ... },
  async listRemoteSessions(projectId) { ... },
  getBaseUrl(sessionId) { ... },
  async injectMcp(sessionId, server) { ... },
};
```

- `start()`:
  1. Sends `opencode:spawn { sessionId, projectRoot }` → Rust spawns process
  2. Listens for `agent://opencode-ready` event to get `baseUrl`
  3. Calls `createOpencodeClient({ baseUrl })` from `@opencode-ai/sdk`
  4. Subscribes to SSE event stream
  5. Maps SSE events to `AgentMessage` union and calls `options.onMessage()`
  6. Calls `options.onStatusChange("idle")`

- `send()`: calls `client.session.prompt_async({ sessionId, parts: [{ type: "text", text: prompt }] })`
- `abort()`: calls `client.session.abort({ sessionId })`
- `listRemoteSessions()`: calls `client.session.list()`, maps to `RemoteSession[]`
- `injectMcp()`: calls `client.mcp.add({ name, config })`

### SSE → AgentMessage mapping

| OpenCode SSE event type | AgentMessage kind |
|---|---|
| `assistant.message.created` | `text` (role: assistant, start streaming) |
| `assistant.message.delta` | `text` (append content) |
| `assistant.message.stop` | `system` (event: "done") |
| `tool.use` | `tool_use` |
| `tool.result` | `tool_result` |
| `session.error` | `system` (event: "error", detail: error message) |
| `server.heartbeat` | `system` (event: "heartbeat") |

### `src/lib/drivers/opencode.ts` (frontend shim)

Thin `AgentDriverWithRemoteSessions` implementation that proxies all calls to the sidecar via `sendSidecarMessage` / `onSidecarEvent`. The frontend registry holds this object — never the sidecar driver directly.

### Verify

- `cargo build` zero warnings
- `bun run typecheck` zero errors
- `bun run lint` zero errors
- `bun run build:sidecar` compiles successfully
- `spawn_opencode_server` starts a process and emits `agent://opencode-ready` with a valid baseUrl
- `stop_opencode_server` kills the process cleanly
- Killing the process externally triggers the watchdog and emits `agent://process-crashed`

---

## Chunk 45 — Claude Driver (refactor chunk 12 into AgentDriver)

### `sidecar/src/drivers/claude.ts` (replaces `adapters/claude.ts`)

Implements `AgentDriver` (NOT `AgentDriverWithRemoteSessions` — DevHub SQLite is the source of truth for Claude sessions):

```ts
export const claudeDriver: AgentDriver = {
  id: "claude",
  name: "Claude",
  description: "Anthropic Claude agent via the Claude Agent SDK with full tool use",
  supportsResume: true,
  supportsMcp: true,

  async start(options) { ... },
  async resume(options) { ... },
  async stop(sessionId) { ... },
  async send(sessionId, prompt) { ... },
  async abort(sessionId) { ... },
};
```

### SDK message → AgentMessage mapping

| Claude SDK message type | AgentMessage kind |
|---|---|
| `system` (role: assistant, init event) | `system` (event: "init", detail: claudeSessionId) |
| `text` (role: assistant) | `text` (role: "assistant") |
| `tool_use` | `tool_use` |
| `tool_result` | `tool_result` |
| `end_turn` | `system` (event: "done") |
| error thrown | `system` (event: "error", detail: err.message) |

### Refactor `src/hooks/useAgentSession.ts`

- Deprecate `useCreateClaudeSession`, `useClaudeEventStream`, `useResumeClaudeSession`, `useAbortClaudeSession`
- Replace with unified hooks from `useAgentDriver.ts`:
  - `useStartSession(projectId, driverId)`
  - `useResumeSession(projectId)`
  - `useSendMessage(sessionId)`
  - `useAbortSession(sessionId)`
- Keep old hooks temporarily behind a `@deprecated` JSDoc comment — remove in chunk 13

### `src/lib/drivers/claude.ts` (frontend shim)

Thin `AgentDriver` implementation proxying to sidecar IPC.

### Verify

- `bun run typecheck` zero errors
- `bun run lint` zero errors
- `bun run build:sidecar` compiles successfully
- Claude driver correctly maps all SDK message types to `AgentMessage` union
- `supportsResume: true` — resuming a session with a known `externalId` works

---

## Plugin System: How to Write a Local Driver

Document this in `~/.devhub/DRIVER_AUTHORING.md` (generated on first app launch):

```ts
// ~/.devhub/drivers/my-agent.ts
// Must export a default export or named `driver` export implementing AgentDriver

import type { AgentDriver, AgentStartOptions } from "devhub/types";

export const driver: AgentDriver = {
  id: "my-agent",           // must be unique
  name: "My Agent",
  description: "Custom agent driver",
  supportsResume: false,
  supportsMcp: false,

  async start(options: AgentStartOptions) {
    options.onStatusChange("initializing");
    // ... connect to your agent
    options.onStatusChange("idle");
  },

  async resume(options) { /* ... */ },
  async stop(sessionId) { /* ... */ },
  async send(sessionId, prompt) { /* ... */ },
  async abort(sessionId) { /* ... */ },
};
```

The driver file is loaded by the sidecar via dynamic `import()`. It runs in the
sidecar's Node.js context and has access to all Node.js built-ins and any
packages installed in `sidecar/node_modules`. To use external packages, install
them in the sidecar: `cd sidecar && bun add my-package`.

---

## Verify (all chunks)

- `cargo build` in `src-tauri/` — zero warnings
- `bun run typecheck` — zero errors
- `bun run lint` — zero errors
- `bun run build:sidecar` — compiles successfully
- `listManifests()` returns `opencode` and `claude` built-in drivers
- Starting an OpenCode session spawns the process, reads the port, connects
- Starting a Claude session streams messages correctly mapped to `AgentMessage` union
- Loading a local driver file from disk registers it in `listManifests()`
- Loading an invalid file returns a descriptive error without crashing the sidecar
- No `console.log` in committed code
- No `invoke()` outside `src/lib/tauri.ts`
- `plugins.shell` in `tauri.conf.json` only contains `"open": true`
- Zustand selectors use separate `useStore((s) => s.field)` calls — no inline objects
