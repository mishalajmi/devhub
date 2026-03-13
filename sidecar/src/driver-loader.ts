/**
 * driver-loader.ts
 *
 * Manages registration of agent drivers in the sidecar process.
 *
 * Built-in drivers (opencode, claude) are registered at startup.
 * Local (user) drivers are loaded on demand from an absolute file path
 * or discovered by scanning ~/.devhub/drivers/.
 *
 * The registry here is sidecar-side only. The Tauri backend queries it
 * via the `drivers:list` and `drivers:load` IPC message types.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type {
  AgentDriver,
  AgentDriverManifest as DriverManifest,
} from "@devhub/types";
import { isDriverWithRemoteSessions } from "@devhub/types";

export type { DriverManifest };

// ─── Registry ─────────────────────────────────────────────────────────────────

interface RegistryEntry {
  manifest: DriverManifest;
  driver: AgentDriver;
}

const registry = new Map<string, RegistryEntry>();

/** Register a driver. Throws if a driver with the same id is already registered. */
function registerDriver(
  driver: AgentDriver,
  source: "builtin" | "local" = "builtin",
  filePath?: string,
  version = "1.0.0"
): DriverManifest {
  if (registry.has(driver.id)) {
    throw new Error(`Driver "${driver.id}" is already registered`);
  }

  const manifest: DriverManifest = {
    id: driver.id,
    name: driver.name,
    description: driver.description,
    version,
    source,
    path: filePath,
    supportsResume: driver.supportsResume,
    supportsMcp: driver.supportsMcp,
    hasRemoteSessions: isDriverWithRemoteSessions(driver),
  };

  registry.set(driver.id, { manifest, driver });
  process.stderr.write(`[driver-loader] registered driver: ${driver.id} (${source})\n`);
  return manifest;
}

/** Unregister a driver by id. Throws if not found. */
export function unregisterDriver(id: string): void {
  if (!registry.has(id)) {
    throw new Error(`Driver "${id}" is not registered`);
  }
  registry.delete(id);
  process.stderr.write(`[driver-loader] unregistered driver: ${id}\n`);
}

/** Get a registered driver by id. Throws if not found. */
export function getDriver(id: string): AgentDriver {
  const entry = registry.get(id);
  if (!entry) throw new Error(`No driver registered with id: "${id}"`);
  return entry.driver;
}

/** List all registered driver manifests, sorted by name. */
export function listManifests(): DriverManifest[] {
  return [...registry.values()]
    .map(({ manifest }) => manifest)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Validation ───────────────────────────────────────────────────────────────

const REQUIRED_METHODS = ["start", "resume", "stop", "send", "abort"] as const;
const REQUIRED_FIELDS = ["id", "name", "description", "supportsResume", "supportsMcp"] as const;

/**
 * Validate that a dynamically imported module export looks like an AgentDriver.
 * Returns a descriptive error string if invalid, null if valid.
 */
function validateDriver(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== "object") {
    return "exported value is not an object";
  }

  const obj = candidate as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj)) {
      return `missing required field: "${field}"`;
    }
  }

  if (typeof obj.id !== "string" || !obj.id.trim()) {
    return `"id" must be a non-empty string`;
  }

  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return `"name" must be a non-empty string`;
  }

  if (typeof obj.description !== "string") {
    return `"description" must be a string`;
  }

  if (typeof obj.supportsResume !== "boolean") {
    return `"supportsResume" must be a boolean`;
  }

  if (typeof obj.supportsMcp !== "boolean") {
    return `"supportsMcp" must be a boolean`;
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof obj[method] !== "function") {
      return `missing required method: "${method}"`;
    }
  }

  return null;
}

// ─── Built-in driver registration ─────────────────────────────────────────────

/**
 * Register all built-in drivers.
 * Called once at sidecar startup before the stdin loop begins.
 * Failures are logged but do not crash the sidecar.
 */
export async function loadBuiltinDrivers(): Promise<void> {
  const builtins: Array<() => Promise<{ driver: AgentDriver; version?: string }>> = [
    async () => {
      const mod = await import("./adapters/opencode.js");
      // The existing opencodeAdapter is the legacy adapter — the new driver
      // will be at mod.opencodeDriver once chunk 44 is implemented.
      // For now, skip if the named export doesn't exist yet.
      if (!("opencodeDriver" in mod)) {
        process.stderr.write(
          "[driver-loader] opencodeDriver not yet exported from adapters/opencode — skipping builtin registration\n"
        );
        return { driver: null as unknown as AgentDriver };
      }
      return { driver: (mod as Record<string, unknown>).opencodeDriver as AgentDriver };
    },
    async () => {
      const mod = await import("./adapters/claude.js");
      if (!("claudeDriver" in mod)) {
        process.stderr.write(
          "[driver-loader] claudeDriver not yet exported from adapters/claude — skipping builtin registration\n"
        );
        return { driver: null as unknown as AgentDriver };
      }
      return { driver: (mod as Record<string, unknown>).claudeDriver as AgentDriver };
    },
  ];

  for (const load of builtins) {
    try {
      const { driver, version } = await load();
      if (!driver) continue;

      const validationError = validateDriver(driver);
      if (validationError) {
        process.stderr.write(
          `[driver-loader] builtin driver failed validation: ${validationError}\n`
        );
        continue;
      }

      registerDriver(driver, "builtin", undefined, version ?? "1.0.0");
    } catch (err) {
      process.stderr.write(
        `[driver-loader] failed to load builtin driver: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }
}

// ─── Local (user) driver loading ──────────────────────────────────────────────

/**
 * Load a single local driver from an absolute file path.
 * The file must have a default export or a named `driver` export
 * that implements AgentDriver.
 *
 * Returns the registered manifest on success.
 * Throws a descriptive error on failure — does not catch internally.
 */
export async function loadLocalDriver(filePath: string): Promise<DriverManifest> {
  const resolved = path.resolve(filePath);

  // Confirm file exists before attempting import
  try {
    await fs.access(resolved);
  } catch {
    throw new Error(`Driver file not found: "${resolved}"`);
  }

  const ext = path.extname(resolved).toLowerCase();
  if (ext !== ".js" && ext !== ".ts" && ext !== ".mjs") {
    throw new Error(
      `Unsupported driver file extension "${ext}" — must be .js, .mjs, or .ts`
    );
  }

  // Dynamic import — Bun handles .ts natively; .js/.mjs work in any Node/Bun
  let mod: Record<string, unknown>;
  try {
    mod = (await import(resolved)) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Failed to import driver file "${resolved}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Accept `default` export or named `driver` export
  const candidate = mod.default ?? mod.driver;
  if (!candidate) {
    throw new Error(
      `Driver file "${resolved}" must have a default export or a named "driver" export`
    );
  }

  const validationError = validateDriver(candidate);
  if (validationError) {
    throw new Error(`Driver file "${resolved}" is invalid: ${validationError}`);
  }

  const driver = candidate as AgentDriver;

  // If this driver id is already registered (e.g. hot-reload), unregister first
  if (registry.has(driver.id)) {
    process.stderr.write(
      `[driver-loader] re-registering existing driver: ${driver.id}\n`
    );
    registry.delete(driver.id);
  }

  return registerDriver(driver, "local", resolved);
}

/**
 * Scan ~/.devhub/drivers/ for .js, .mjs, and .ts files and attempt to load
 * each as a local driver. Per-file errors are logged but do not abort the scan.
 *
 * Returns an array of successfully loaded manifests.
 */
export async function loadLocalDriversFromDir(
  dir = path.join(os.homedir(), ".devhub", "drivers")
): Promise<DriverManifest[]> {
  let entries: string[];

  try {
    const dirEntries = await fs.readdir(dir);
    entries = dirEntries.filter((f) =>
      [".js", ".mjs", ".ts"].includes(path.extname(f).toLowerCase())
    );
  } catch (err) {
    // Directory doesn't exist yet — not an error
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    process.stderr.write(
      `[driver-loader] failed to read drivers dir "${dir}": ${err instanceof Error ? err.message : String(err)}\n`
    );
    return [];
  }

  const loaded: DriverManifest[] = [];

  for (const file of entries) {
    const filePath = path.join(dir, file);
    try {
      const manifest = await loadLocalDriver(filePath);
      loaded.push(manifest);
    } catch (err) {
      process.stderr.write(
        `[driver-loader] skipping "${file}": ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }

  process.stderr.write(
    `[driver-loader] loaded ${loaded.length}/${entries.length} local drivers from "${dir}"\n`
  );

  return loaded;
}
