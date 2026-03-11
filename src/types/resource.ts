export type ResourceType = "docker" | "service" | "database" | "cloud" | "env";

export interface ProjectResource {
  id: string;
  projectId: string;
  resourceType: ResourceType;
  name: string;
  configJson: string;
  createdAt: string;
  // Live status — not persisted, polled at runtime
  liveStatus?: ResourceLiveStatus;
}

export interface DockerResourceConfig {
  containerName?: string;
  composePath?: string;
}

export interface ServiceResourceConfig {
  port: number;
  processName?: string;
}

export interface DatabaseResourceConfig {
  connectionString: string;
  dbType: "postgres" | "mysql" | "sqlite" | "redis" | "mongodb";
}

export interface CloudResourceConfig {
  provider: "aws" | "gcp" | "azure";
  profile?: string;
  region?: string;
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
  name?: string;
  configJson?: string;
}
