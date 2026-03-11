export type ResourceType = "docker" | "service" | "database" | "cloud" | "env";

/**
 * Matches the Rust `ResourceRow` struct (camelCase serde).
 * `resourceType` maps to the `type` column in SQLite.
 */
export interface ProjectResource {
  id: string;
  projectId: string;
  /** Matches the `resource_type` field in Rust (serialised as `resourceType`). */
  resourceType: ResourceType;
  name: string;
  configJson: string;
  createdAt: string;
  // Live status — not persisted, polled at runtime
  liveStatus?: ResourceLiveStatus;
}

export interface DockerResourceConfig {
  containerName?: string;
  image?: string;
}

export interface ServiceResourceConfig {
  port: number;
  protocol?: "http" | "https" | "tcp";
}

export interface DatabaseResourceConfig {
  connectionString: string;
  dbType: "postgres" | "mysql" | "sqlite" | "redis" | "mongodb";
}

export interface CloudResourceConfig {
  provider: "aws" | "gcp" | "azure";
  region?: string;
  resourceType?: string;
}

export interface EnvResourceConfig {
  filePath?: string;
  key?: string;
  value?: string;
}

export type ResourceConfig =
  | DockerResourceConfig
  | ServiceResourceConfig
  | DatabaseResourceConfig
  | CloudResourceConfig
  | EnvResourceConfig;

export interface ResourceLiveStatus {
  healthy: boolean;
  label: string;
  detail?: string;
  checkedAt: string;
}

/** Input shape for the `create_resource` Tauri command (camelCase IPC). */
export interface CreateResourceInput {
  projectId: string;
  resourceType: ResourceType;
  name: string;
  /** JSON-serialised config object. */
  configJson: string;
}

/** Input shape for the `update_resource` Tauri command (camelCase IPC). */
export interface UpdateResourceInput {
  id: string;
  name: string;
  /** JSON-serialised config object. */
  configJson: string;
}
