export type ResourceType = "docker" | "service" | "database" | "cloud" | "env";

export interface ProjectResource {
  id: string;
  projectId: string;
  type: ResourceType;
  name: string;
  config: ResourceConfig;
  createdAt: string;
  // Live status — not persisted, polled at runtime
  liveStatus?: ResourceLiveStatus;
}

export type ResourceConfig =
  | DockerResourceConfig
  | ServiceResourceConfig
  | DatabaseResourceConfig
  | CloudResourceConfig
  | EnvResourceConfig;

export interface DockerResourceConfig {
  type: "docker";
  containerName?: string;
  composePath?: string;
}

export interface ServiceResourceConfig {
  type: "service";
  port: number;
  processName?: string;
}

export interface DatabaseResourceConfig {
  type: "database";
  connectionString: string;
  dbType: "postgres" | "mysql" | "sqlite" | "redis" | "mongodb";
}

export interface CloudResourceConfig {
  type: "cloud";
  provider: "aws" | "gcp" | "azure";
  profile?: string;
  region?: string;
}

export interface EnvResourceConfig {
  type: "env";
  filePath: string;
}

export interface ResourceLiveStatus {
  healthy: boolean;
  label: string;
  detail?: string;
  checkedAt: string;
}

export interface CreateResourceInput {
  projectId: string;
  type: ResourceType;
  name: string;
  config: ResourceConfig;
}
