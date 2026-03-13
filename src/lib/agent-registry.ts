import type { AgentDriver, AgentDriverManifest } from "@/types/agent-driver";
import { isDriverWithRemoteSessions } from "@/types/agent-driver";
import {
  DriverNotFoundError,
  DriverAlreadyRegisteredError,
} from "@/errors/registry";

interface RegistryEntry {
  manifest: AgentDriverManifest;
  driver: AgentDriver;
}

export class AgentRegistry {
  private readonly repository = new Map<string, RegistryEntry>();

  registerDriver(
    driver: AgentDriver,
    source: "builtin" | "local" = "builtin",
    path?: string,
    version = "1.0.0",
  ): boolean {
    if (this.repository.has(driver.id)) {
      throw new DriverAlreadyRegisteredError(driver.id);
    }

    const manifest: AgentDriverManifest = {
      id: driver.id,
      name: driver.name,
      description: driver.description,
      version,
      source,
      path,
      supportsResume: driver.supportsResume,
      supportsMcp: driver.supportsMcp,
      hasRemoteSessions: isDriverWithRemoteSessions(driver),
    };

    this.repository.set(driver.id, { manifest, driver });
    return true;
  }

  getDriver(id: string): AgentDriver {
    const entry = this.repository.get(id);
    if (!entry) throw new DriverNotFoundError(id);
    return entry.driver;
  }

  getManifest(id: string): AgentDriverManifest {
    const entry = this.repository.get(id);
    if (!entry) throw new DriverNotFoundError(id);
    return entry.manifest;
  }

  listManifests(): AgentDriverManifest[] {
    return [...this.repository.values()]
      .map(({ manifest }) => manifest)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  unregisterDriver(id: string): boolean {
    if (!this.repository.has(id)) throw new DriverNotFoundError(id);
    return this.repository.delete(id);
  }

  get size(): number {
    return this.repository.size;
  }
}

export const registry = new AgentRegistry();
