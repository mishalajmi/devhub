/**
 * Frontend driver shim registry.
 *
 * Maps driver IDs to their IPC shim objects.  Builtin shims (opencode, claude)
 * are statically declared here.  Local (user-loaded) drivers registered in the
 * sidecar get the generic proxy treatment — all calls are routed by driver id.
 *
 * Usage:
 *   import { getDriverShim } from "@/lib/drivers";
 *   const driver = getDriverShim("opencode"); // throws DriverNotFoundError if unknown
 */

import { DriverNotFoundError } from "@devhub/errors";
import type { AgentDriver } from "@devhub/types";
import { opencodeDriverShim } from "./opencode";
import { claudeDriverShim } from "./claude";

const shims: Record<string, AgentDriver> = {
  opencode: opencodeDriverShim,
  claude: claudeDriverShim,
};

/**
 * Return the frontend IPC shim for a given driver id.
 * Throws DriverNotFoundError if no shim is registered for that id.
 */
export function getDriverShim(id: string): AgentDriver {
  const shim = shims[id];
  if (!shim) throw new DriverNotFoundError(id);
  return shim;
}
