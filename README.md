<p align="center">
  <img src="src-tauri/icons/icon.png" width="100" alt="DevHub" />
</p>

<h1 align="center">DevHub</h1>

<p align="center">A cross-platform developer control plane.</p>

---

DevHub is a Tauri v2 desktop application that manages project state, AI agent sessions (OpenCode and Claude), MCP server lifecycles, resource visibility, and a reusable prompt skill library. It targets developers working across multiple projects who want a single interface to coordinate agent sessions, running services, and environment context.

## Features

- Project management with automatic detection of git repositories, docker-compose files, and `.env` files
- AI agent sessions via OpenCode (HTTP/SSE against a local `opencode serve` instance) and Claude (Agent SDK) with session persistence and resumption across app restarts
- File watcher (`notify`) that reactively updates project state on filesystem changes
- MCP server registry with per-project process lifecycle management; servers are injected into agent sessions at creation time
- Prompt skill library with project-scoped and global skills, injectable into agent sessions
- Directory tree viewer per project

**Planned (not yet shipped):**
- Resources panel: Docker containers (bollard), local port scanner, database connections, cloud CLI integration, env/secrets manager
- MCP server process spawning (registry UI exists; process spawner is stubbed)
- Global search

## Installation

### Download

Pre-built binaries are not yet available. Build from source below.

### Build from source

**Prerequisites:** Rust (stable), Bun

```bash
git clone https://github.com/mishalajmi/devhub.git
cd devhub
bun install
bun run tauri dev
```

## Development

```bash
# Frontend only
bun run dev

# Full app (frontend + Rust backend)
bun run tauri dev

# Type check
bun run typecheck

# Lint
bun run lint

# Rust build only
cd src-tauri && cargo build
```

## Local Agent Drivers

DevHub supports custom agent drivers loaded from `~/.devhub/drivers/`. Each file must export a named `driver` implementing the `AgentDriver` interface from `@devhub/types`.

```ts
// ~/.devhub/drivers/my-agent.ts
import type { AgentDriver, AgentStartOptions } from "@devhub/types";

export const driver: AgentDriver = {
  id: "my-agent",        // must be unique across all registered drivers
  name: "My Agent",
  description: "Custom agent driver",
  supportsResume: false,
  supportsMcp: false,

  async start(options: AgentStartOptions) {
    options.onStatusChange("initializing");
    // connect to your agent...
    options.onStatusChange("idle");
  },

  async resume(options: AgentStartOptions) { /* ... */ },
  async stop(sessionId: string) { /* ... */ },
  async send(sessionId: string, prompt: string) { /* ... */ },
  async abort(sessionId: string) { /* ... */ },
};
```

Drivers in `~/.devhub/drivers/` are scanned and registered automatically on app startup. To load a specific file at runtime:

```ts
import { loadLocalDriver } from "@/lib/tauri";

const manifest = await loadLocalDriver("/absolute/path/to/my-agent.ts");
```

Drivers run in the sidecar's Node.js context and have access to all Node.js built-ins. To use external packages, install them in the sidecar: `cd sidecar && bun add my-package`.

## Contributing

Fork the repository, create a branch off `main`, and open a pull request with a clear description of the change. See `AGENTS.md` for architecture, code style, and conventions.
