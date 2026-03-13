# AGENTS.md

## Project Overview

**DevHub** is a cross-platform Tauri v2 desktop application that acts as a developer
control plane. It aggregates projects, AI agents (OpenCode, Claude), resources
(Docker, local services, databases, cloud, env vars), MCP servers, and a prompt
skill library into a single keyboard-first, dark-mode interface.

## Repository Structure

```
devhub/
├── src-tauri/                    # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── main.rs               # Binary entry point
│   │   ├── lib.rs                # Library root — wires plugins + commands
│   │   ├── commands/             # Tauri command handlers (one file per domain)
│   │   │   ├── mod.rs
│   │   │   ├── project.rs        # CRUD for projects
│   │   │   ├── agent.rs          # Agent session management
│   │   │   ├── mcp.rs            # MCP server registry + lifecycle
│   │   │   ├── resource.rs       # Resources (docker, ports, db, cloud, env)
│   │   │   └── skill.rs          # Prompt skill library
│   │   ├── db/                   # SQLite setup and migrations
│   │   │   ├── mod.rs            # Connection pool + init
│   │   │   └── migrations/       # SQL migration files (001_init.sql, etc.)
│   │   └── services/             # Business logic — no Tauri coupling here
│   │       ├── mod.rs
│   │       ├── docker.rs         # bollard Docker API
│   │       ├── port_scanner.rs   # Scan listening ports
│   │       ├── file_watcher.rs   # notify-based FS watching
│   │       └── process.rs        # Spawn/kill child processes (MCP servers)
│   ├── capabilities/
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
│
├── src/                          # React frontend
│   ├── main.tsx                  # React root
│   ├── App.tsx                   # Router + QueryClientProvider + stores init
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives (never edit directly)
│   │   ├── layout/               # AppShell, Sidebar, TabBar, StatusBar
│   │   ├── agents/               # AgentPanel, TerminalView, SessionList
│   │   ├── resources/            # DockerPanel, ServicesPanel, DbPanel, CloudPanel, EnvPanel
│   │   ├── mcp/                  # McpRegistry, McpServerCard, McpStatusBadge
│   │   └── skills/               # SkillLibrary, SkillEditor, SkillCard
│   ├── stores/                   # Zustand stores (one per domain)
│   │   ├── projects.store.ts
│   │   ├── agents.store.ts
│   │   ├── mcp.store.ts
│   │   ├── resources.store.ts
│   │   └── skills.store.ts
│   ├── hooks/                    # Custom React hooks
│   │   ├── useProject.ts
│   │   ├── useAgentSession.ts
│   │   └── useResourceStatus.ts
│   ├── lib/
│   │   ├── tauri.ts              # ALL Tauri invoke() calls go here (typed wrappers)
│   │   ├── opencode.ts           # OpenCode HTTP/SSE client wrapper
│   │   ├── claude.ts             # Claude Agent SDK bridge (via sidecar events)
│   │   └── utils.ts              # cn(), formatting helpers
│
├── sidecar/                      # Node.js sidecar process
│   ├── src/
│   │   ├── index.ts              # Entry: IPC bridge with Tauri via stdin/stdout
│   │   ├── driver-loader.ts      # AgentRegistry — loads builtin + local drivers
│   │   └── adapters/
│   │       ├── opencode.ts       # @opencode-ai/sdk session management
│   │       └── claude.ts         # @anthropic-ai/claude-agent-sdk wrapper
│   ├── package.json
│   └── tsconfig.json
│
├── packages/
│   └── types/                    # @devhub/types — shared types (frontend + sidecar)
│       └── src/
│           ├── agent.ts
│           ├── agent-driver.ts
│           ├── mcp.ts
│           ├── project.ts
│           ├── resource.ts
│           ├── skill.ts
│           ├── sidecar.ts
│           └── index.ts          # barrel export
│
└── AGENTS.md
```

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 |
| Frontend framework | React 19 + TypeScript |
| Build tool | Vite 7 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| State management | Zustand |
| Async data | TanStack Query v5 |
| Terminal rendering | xterm.js (@xterm/xterm) |
| Icons | lucide-react |
| Rust DB | rusqlite (bundled SQLite) |
| Rust migrations | rusqlite_migration |
| Docker API | bollard |
| File watching | notify |
| Process/PTY | std::process + portable-pty |
| Sidecar runtime | Node.js 20+ |
| OpenCode IPC | @opencode-ai/sdk (HTTP/SSE) |
| Claude IPC | @anthropic-ai/claude-agent-sdk |

## Code Style

### TypeScript / React

- **Functional components only** — no class components, ever
- **Named exports only** — no default exports except `App.tsx` and page-level route components
- **File naming**: `kebab-case.tsx` for components, `camelCase.ts` for utilities and stores
- **Props**: typed via `interface`, not `type` alias (e.g. `interface AgentPanelProps { ... }`)
- **Stores**: each Zustand store file exports exactly one `use<Domain>Store` hook
- **Data fetching**: TanStack Query for all async data — no raw `useEffect` for fetching
- **Tauri calls**: all `invoke()` calls go through typed wrappers in `src/lib/tauri.ts` — never call `invoke()` directly from components or stores
- **No cross-layer imports**: `components/ui/*` must not be imported in stores, lib, or hooks
- **No `console.log`** in committed code — use the structured logger (`src/lib/logger.ts`)
- **Styling**: use the `cn()` utility from `src/lib/utils.ts` for conditional class merging

### Rust

- **One command file per domain** under `src-tauri/src/commands/` — no mega files
- **Separation of concerns**: command handlers call service functions; they do not contain business logic themselves
- **Error types**: use `thiserror` for all custom error enums; services return `anyhow::Result<T>`; command handlers return `Result<T, String>` (Tauri-compatible)
- **Doc comments**: all public functions (`pub fn`) must have a `///` doc comment
- **Database access**: all SQL queries live in `src-tauri/src/db/` — services call db module functions, never raw SQL inline
- **No hardcoded values**: ports, paths, timeouts go through app config or constants in a `constants.rs` file

### General

- **No hardcoded credentials, ports, or paths** — configuration only
- **Feature flags** via Tauri build config, not runtime if/else chains
- **All environment-specific values** sourced from app settings store
- **Migration files** must be sequential and named `NNN_description.sql` (e.g. `001_init.sql`)

## Agent Driver Architecture

### Registry ownership — sidecar owns it
The **sidecar is the single owner of the AgentRegistry**. It is the only process
that can dynamically `import()` arbitrary `.ts`/`.js` driver files, use npm
packages, and run SDK code. The frontend WebView cannot do any of this.

There is **no `AgentRegistry` class on the frontend**. Do not create one.

### Frontend — thin manifest cache (Zustand store)
The frontend holds a read-only cache of driver manifests fetched from the sidecar:

```ts
// src/stores/drivers.store.ts
interface DriversState {
  manifests: AgentDriverManifest[];
  setManifests: (manifests: AgentDriverManifest[]) => void;
}
export const useDriversStore = create<DriversState>((set) => ({
  manifests: [],
  setManifests: (manifests) => set({ manifests }),
}));
```

Populated on app startup via a `useDrivers()` TanStack Query hook:
- Calls `listDriverManifests()` Tauri typed wrapper
- Tauri sends `drivers:list` to sidecar via stdin IPC
- Sidecar responds with its registry manifests
- Result stored in `useDriversStore`

The frontend **never registers drivers** — it only reads what the sidecar reports.

### Frontend driver shims
`src/lib/drivers/opencode.ts`, `src/lib/drivers/claude.ts` etc. are **IPC
wrapper objects**, not registry entries. They implement `AgentDriver` by
proxying every method call to the sidecar via `sendSidecarMessage` /
`onSidecarEvent`. Resolved by driver id from a static map:

```ts
// src/lib/drivers/index.ts
const shims: Record<string, AgentDriver> = {
  opencode: opencodeDriverShim,
  claude:   claudeDriverShim,
};
export function getDriverShim(id: string): AgentDriver {
  const shim = shims[id];
  if (!shim) throw new DriverNotFoundError(id);
  return shim;
}
```

Local (user-loaded) drivers registered in the sidecar get a **generic shim**
that proxies all calls by driver id — no per-driver frontend code needed.

### Shared types
All types shared between frontend and sidecar live in `packages/types/`
(`@devhub/types`). Import from there directly — never from `src/types/`.
The `src/types/` directory has been deleted.

```
packages/types/src/
  agent.ts         ← AgentSession, AgentType, OpenCodeSession, ClaudeEvent…
  agent-driver.ts  ← AgentDriver, AgentMessage union, AgentDriverManifest…
  mcp.ts           ← McpServer, McpServerConfig…
  project.ts       ← Project, DirNode, FolderScanResult…
  resource.ts      ← ProjectResource, ResourceType…
  skill.ts         ← Skill, CreateSkillInput…
  sidecar.ts       ← SidecarRequest, SidecarResponse, SidecarEvent
  index.ts         ← barrel export from all files
```

### Tauri commands for driver management
- `list_driver_manifests` — sends `drivers:list` to sidecar, returns `AgentDriverManifest[]`
- `load_local_driver(path)` — sends `drivers:load { path }` to sidecar, returns `AgentDriverManifest`

Typed wrappers in `src/lib/tauri.ts`:
```ts
export const listDriverManifests = (): Promise<AgentDriverManifest[]> =>
  invoke("list_driver_manifests");

export const loadLocalDriver = (path: string): Promise<AgentDriverManifest> =>
  invoke("load_local_driver", { path });
```

## Agent Integration Contracts

### OpenCode

OpenCode exposes a full HTTP/SSE server (`opencode serve`, default port 4096).

- **Discovery**: scan ports 4096–4196 for `/global/health` returning `{ healthy: true }`
- **Client**: use `createOpencodeClient({ baseUrl })` from `@opencode-ai/sdk`
- **Sessions**: create via `POST /session`, send prompts via `POST /session/:id/message` or async via `POST /session/:id/prompt_async`
- **Streaming**: subscribe to `GET /event` SSE stream; filter by `sessionId`
- **MCP injection**: after session creation, call `POST /mcp { name, config }` to add project MCP servers dynamically
- **TUI control**: use `/tui/*` endpoints to drive an existing TUI instance (append prompt, submit, etc.)
- **Source of truth**: OpenCode server owns session/message state; DevHub reads it, never duplicates it in SQLite

### Claude (Agent SDK)

Claude sessions are managed via the Claude Agent SDK running in the Node.js sidecar.

- **Sessions**: created via `query({ prompt, options })` — capture `session_id` from the `system.init` message
- **Resumption**: pass `resume: sessionId` in options to continue an existing session with full context
- **Streaming**: async-iterate the `query()` generator; forward each message to Tauri via `stdin/stdout` IPC as `{ type: "claude:message", sessionId, message }`
- **MCP injection**: pass `mcpServers` config in `ClaudeAgentOptions` at session creation — cannot be injected after start
- **Session IDs**: stored in SQLite `agent_sessions` table for resumption across app restarts

### MCP Servers (App-Owned)

DevHub owns and manages MCP server processes independently from user's global config.

- **Registry**: stored in SQLite `mcp_servers` table
- **Lifecycle**: Rust `std::process::Command` spawns each MCP server as a child process
- **Port pool**: ports 5100–5200 are reserved for DevHub-managed MCP servers
- **Status polling**: every 10 seconds, check if process is alive; emit Tauri event `mcp://status-changed`
- **Injection**: on agent session start, push all project MCP servers to the agent (OpenCode via `POST /mcp`; Claude via `mcpServers` option)
- **Isolation**: DevHub MCP configs are stored in app data dir, never in `~/.config/opencode` or `~/.claude`

## Database Schema (SQLite)

```sql
-- 001_init.sql

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  root_path   TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE project_resources (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL, -- 'docker' | 'service' | 'database' | 'cloud' | 'env'
  name        TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE TABLE mcp_servers (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  command     TEXT NOT NULL,
  args_json   TEXT NOT NULL DEFAULT '[]',
  env_json    TEXT NOT NULL DEFAULT '{}',
  port        INTEGER,
  status      TEXT NOT NULL DEFAULT 'stopped', -- 'running' | 'stopped' | 'error'
  created_at  TEXT NOT NULL
);

CREATE TABLE skills (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE, -- NULL = global skill
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  tags_json   TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE agent_sessions (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_type    TEXT NOT NULL, -- 'opencode' | 'claude'
  external_id   TEXT,          -- session ID in the agent's own system
  status        TEXT NOT NULL DEFAULT 'idle', -- 'running' | 'idle' | 'stopped' | 'error'
  title         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
```

## Tauri Window Configuration

- **Initial size**: 1280×800, minimum 900×600
- **Decorations**: native (platform default)
- **Theme**: dark
- **Single window** — no multi-window unless explicitly implementing a detached terminal feature

## Verifying Diffs

Before marking any chunk complete, verify all of the following:

1. `cargo build` in `src-tauri/` passes with **zero warnings**
2. `bun run typecheck` passes — zero TypeScript errors
3. `bun run lint` passes — zero ESLint errors
4. Affected UI renders correctly and matches the dark dense design language
5. Any new Tauri command has a corresponding typed wrapper in `src/lib/tauri.ts`
6. Any new SQLite table has a migration file in `src-tauri/src/db/migrations/`
7. No raw SQL outside `src-tauri/src/db/`
8. No `invoke()` calls outside `src/lib/tauri.ts`
9. No hardcoded ports, paths, or credentials anywhere
10. No `console.log` in committed code
11. `src-tauri/tauri.conf.json` `plugins.shell` must only contain `"open": true` — never `"sidecar"` (Tauri v2 sidecar permissions are declared in `capabilities/`, not here)
12. Zustand selectors must never use inline object literals `(s) => ({ a: s.a, b: s.b })` — always use separate `useStore((s) => s.field)` calls per field to avoid infinite render loops
13. `create_project` in `src-tauri/src/commands/project.rs` must auto-insert resources for detected `docker-compose` and `.env` files after inserting the project row — do not remove this logic when resolving conflicts

## Commit Message Format

```
<type>(<scope>): <description>
```

**Types**: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`

**Scopes**: `shell`, `projects`, `agents`, `resources`, `mcp`, `skills`, `db`, `sidecar`

**Examples**:
```
feat(agents): add OpenCode session streaming via SSE
feat(mcp): spawn MCP servers as managed child processes
fix(db): correct migration ordering for agent_sessions table
chore(shell): configure Tailwind dark theme tokens
```

## Work Chunks Reference

| # | Phase | Description |
|---|---|---|
| 1 | Scaffold | Tauri v2 + Vite + React + TS project init |
| 2 | Scaffold | AGENTS.md |
| 3 | Scaffold | Tailwind CSS + shadcn/ui setup |
| 4 | Shell | App shell: sidebar, main pane, tab system, dark theme |
| 5 | DB | SQLite init + migrations |
| 6 | Projects | Project CRUD + folder scanner (git, docker-compose, .env auto-detect) |
| 7 | Projects | File watcher (notify) — live project state updates |
| 8 | Projects | Project detail view — Agents/Resources/MCPs/Skills tabs |
| 9 | Projects | Manual resource override UI |
| 10 | Agents | Node.js sidecar setup in Tauri |
| 11 | Agents | OpenCode adapter — connect, discover, session CRUD |
| 12 | Agents | Claude adapter — query(), stream, resume sessions |
| 13 | Agents | Agent session manager UI |
| 14 | Agents | xterm.js terminal panels with stdin/stdout bridge |
| 15 | MCP | MCP server registry (SQLite + Rust process spawner) |
| 16 | MCP | MCP injection into agent sessions at spawn time |
| 17 | MCP | MCP config UI |
| 18 | Skills | Skills CRUD (SQLite) |
| 19 | Skills | Skill injection into agent sessions |
| 20 | Skills | Skills UI |
| 21 | Resources | Docker panel (bollard) |
| 22 | Resources | Local services panel (port scanner) |
| 23 | Resources | Database connections panel |
| 24 | Resources | Cloud resources panel (CLI-based) |
| 25 | Resources | Env/secrets manager |
| 26 | Polish | Global cmd+K search |
| 27 | Polish | Status bar + health indicators |
| 28 | Polish | App settings |
| 29 | Polish | Onboarding flow |
| 30 | Agent Sandboxing | Sandbox configuration model (SQLite + types) |
| 31 | Agent Sandboxing | Filesystem sandboxing — allowed paths enforcement |
| 32 | Agent Sandboxing | Network sandboxing — per-session network access flag |
| 33 | Agent Sandboxing | Env var scoping — allowlist, credential redaction |
| 34 | Agent Sandboxing | Sandbox UI — session creation dialog + badges |
| 35 | Project Init | Init backend — `init_project` command + templates |
| 36 | Project Init | Init dialog UI — multi-step new project flow |
| 37 | Project Init | Template scaffolding details (node/rust/python/.gitignore) |
| 38 | Testing | Rust unit + integration tests (commands, db, cascade delete) |
| 39 | Testing | Frontend unit tests — utils, opencode client, hooks, stores (Vitest) |
| 40 | Testing | Frontend component tests — ResourcesPane, AgentsPane, AppShell |
| 41 | CI | GitHub Actions pipeline — typecheck, lint, cargo build, cargo test, vitest |
| 42 | CI | PR template + branch protection + CI section in AGENTS.md |
| 43 | Agent Drivers | AgentDriver contract + registry + plugin loader (config-driven) |
| 44 | Agent Drivers | OpenCode driver — Rust process spawn + @opencode-ai/sdk client |
| 45 | Agent Drivers | Claude driver — refactor into AgentDriver interface |
