# Feature: Test Suite

## Branch: `feat/testing`

## Context

Several regressions have occurred during rebase conflict resolution that silently
dropped critical logic (auto-resource insertion, field name alignment, Zustand
selector patterns). These were only caught by manual testing. A test suite is
required to catch these automatically on every branch before merge.

## Chunks

### Chunk 38 — Rust Unit & Integration Tests

- [ ] Add `#[cfg(test)]` module to `src-tauri/src/commands/project.rs`:
  - `test_create_project_inserts_docker_resource` — create a temp dir with
    `docker-compose.yml`, call `create_project`, assert a `docker` resource row
    exists in SQLite
  - `test_create_project_inserts_env_resource` — same for `.env`
  - `test_create_project_no_resources_when_empty` — empty dir produces zero resources
  - `test_create_project_duplicate_path_errors` — inserting the same `root_path`
    twice returns an error
- [ ] Add `#[cfg(test)]` module to `src-tauri/src/commands/resource.rs`:
  - `test_create_resource_camel_case_fields` — assert `ResourceRow` serializes with
    `resourceType` and `configJson` (not `type` / `config`)
  - `test_delete_resource` — insert then delete, assert gone
- [ ] Add `#[cfg(test)]` module to `src-tauri/src/db/mod.rs`:
  - `test_migrations_run_cleanly` — open an in-memory SQLite DB, run all
    migrations, assert all expected tables exist
  - `test_project_cascade_delete` — delete a project, assert associated resources,
    sessions, skills, and MCP servers are also deleted
- [ ] Add `cargo test` to the CI verification checklist in `AGENTS.md`
- [ ] All Rust tests must use an **in-memory SQLite DB** (`Connection::open_in_memory()`)
  — never touch the real app database

### Chunk 39 — Frontend Unit Tests (Vitest)

- [ ] Install `vitest`, `@testing-library/react`, `@testing-library/user-event`,
  `@testing-library/jest-dom`, `jsdom` as dev dependencies
- [ ] Configure `vitest` in `vite.config.ts` with `jsdom` environment
- [ ] Add `src/test/setup.ts` — imports `@testing-library/jest-dom` matchers
- [ ] Tests for `src/lib/utils.ts`:
  - `timeAgo` returns `"unknown"` for `null`, `undefined`, and invalid strings
  - `timeAgo` returns correct relative string for known timestamps
  - `cn()` merges Tailwind classes correctly
- [ ] Tests for `src/lib/opencode.ts`:
  - `discoverInstances` returns `[]` when all ports are closed (mock `fetch` to
    reject)
  - `discoverInstances` returns instances when a port responds healthy (mock `fetch`
    to return `{ healthy: true, version: "1.0" }`)
  - `discoverInstances` never throws even if `Promise.allSettled` itself rejects
    (mock to throw)
- [ ] Tests for `src/hooks/useProject.ts` (via `renderHook` + QueryClient):
  - `useCreateProject` calls `selectProject` after successful creation
  - `useCreateProject` invalidates `projectKeys.all` on success
- [ ] Tests for `src/stores/agents.store.ts`:
  - `setInstances` stores instances keyed by projectId
  - Zustand selector using inline object literal triggers re-render loop (negative
    test — assert that split selectors do NOT trigger extra renders)
- [ ] Add `bun run test` script to `package.json`: `vitest run`
- [ ] Add `bun run test:watch` script: `vitest`

### Chunk 40 — Frontend Component Tests

- [ ] Tests for `src/components/projects/resources-pane.tsx`:
  - Renders empty state when `resources` is `[]`
  - Renders a resource row for each resource with correct `resourceType` label
  - Delete button calls `deleteResource` mutation
- [ ] Tests for `src/components/projects/agents-pane.tsx`:
  - Renders `NoInstanceEmptyState` when no instances discovered
  - Does NOT fire discovery when `isActive` is `false`
  - Fires discovery exactly once when `isActive` becomes `true`
- [ ] Tests for `src/components/layout/app-shell.tsx`:
  - Selecting a project calls `selectProject` in the store
  - Renders the correct pane for each tab value
- [ ] All component tests must mock `@/lib/tauri` entirely — no real Tauri IPC
  in tests
- [ ] Mock pattern: `vi.mock("@/lib/tauri", () => ({ listProjects: vi.fn(() =>
  Promise.resolve([])), ... }))`

## Verify

- `cargo test` in `src-tauri/` — all Rust tests pass
- `bun run test` — all frontend tests pass
- `bun run typecheck` — zero errors
- `bun run lint` — zero errors
- Tests run in CI without a real Tauri runtime or SQLite file on disk
