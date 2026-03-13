export type McpServerStatus = "running" | "stopped" | "error";

export interface McpServer {
  id: string;
  projectId: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  port: number | null;
  status: McpServerStatus;
  createdAt: string;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface CreateMcpServerInput {
  projectId: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface UpdateMcpServerInput {
  id: string;
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}
