export type ResourceType = "docker" | "service" | "database" | "cloud" | "env";

/** Matches the Rust ResourceRow struct (camelCase serde). */
export interface ProjectResource {
  id: string;
  projectId: string;
  resourceType: ResourceType;
  name: string;
  configJson: string;
  createdAt: string;
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

export interface CreateResourceInput {
  projectId: string;
  resourceType: ResourceType;
  name: string;
  configJson: string;
}

export interface UpdateResourceInput {
  id: string;
  name: string;
  configJson: string;
}
