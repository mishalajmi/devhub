import {
    DriverAlreadyRegisteredError,
    DriverNotFoundError,
} from "@devhub/errors";
import type { AgentDriver, AgentDriverManifest } from "@devhub/types";
import { isDriverWithRemoteSessions } from "@devhub/types";

interface RegistryEntry {
  manifest: AgentDriverManifest;
  driver: AgentDriver;
}


const REQUIRED_METHODS = ["start", "resume", "stop", "send", "abort"] as const;
const REQUIRED_FIELDS = ["id", "name", "description", "supportsResume", "supportsMcp"] as const;

export class AgentRegistry {
  private readonly registry = new Map<string, RegistryEntry>();

  /** Register a driver. Throws if a driver with the same id is already registered. */
  public registerDriver(
    driver: AgentDriver,
    source: "builtin" | "local" = "builtin",
    filePath?: string,
    version = "1.0.0"
  ): AgentDriverManifest {
    if (this.registry.has(driver.id)) {
      throw new DriverAlreadyRegisteredError(driver.id);
    }

    const manifest: AgentDriverManifest = {
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

    this.registry.set(driver.id, { manifest, driver });
    process.stderr.write(`[driver-loader] registered driver: ${driver.id} (${source})\n`);
    return manifest;
  }

  /** Get a registered driver by id. Throws if not found. */
  public getDriver(id: string): AgentDriver {
    const entry = this.registry.get(id);
    if (!entry) throw new DriverNotFoundError(id);
    return entry.driver;
  }

  public getManifest(id: string): AgentDriverManifest {
    const entry = this.registry.get(id);
    if (!entry) throw new DriverNotFoundError(id);
    return entry.manifest;
  }


  /** List all registered driver manifests, sorted by name. */
  public listManifests(): AgentDriverManifest[] {
    return [...this.registry.values()]
      .map(({ manifest }) => manifest)
      .sort((a, b) => a.name.localeCompare(b.name));
  }


  /** Unregister a driver by id. Throws if not found. */
 public unregisterDriver(id: string): void {
    if (!this.registry.has(id)) {
      throw new DriverNotFoundError(id);
    }
    this.registry.delete(id);
    process.stderr.write(`[driver-loader] unregistered driver: ${id}\n`);
  }

  public has(id: string): boolean {
    return this.registry.has(id);
  }

  public get size(): number {
    return this.registry.size;
  }

}

/**
 * Validate that a dynamically imported module export looks like an AgentDriver.
 * Returns a descriptive error string if invalid, null if valid.
 */
export function validateDriver(candidate: unknown): string[] | null {
  let errors: string[] = [];
  if (!candidate || typeof candidate !== "object") {
    errors.push("exported value is not an object");
  }

  const obj = candidate as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj)) {
      errors.push(`missing required field: "${field}"`);
    }
  }

  if (typeof obj.id !== "string" || !obj.id.trim()) {
    errors.push(`"id" must be a non-empty string`);
  }

  if (typeof obj.name !== "string" || !obj.name.trim()) {
    errors.push(`"name" must be a non-empty string`);
  }

  if (typeof obj.description !== "string") {
    errors.push(`"description" must be a string`);
  }

  if (typeof obj.supportsResume !== "boolean") {
    errors.push(`"supportsResume" must be a boolean`);
  }

  if (typeof obj.supportsMcp !== "boolean") {
    errors.push(`"supportsMcp" must be a boolean`);
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof obj[method] !== "function") {
      errors.push(`missing required method: "${method}"`);
    }
  }

  if (errors.length > 0)
    return errors;

  return null;
}

export const Registry = new AgentRegistry();
