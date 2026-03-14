export interface Project {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  // Detected metadata — not persisted, populated by the folder scanner
  hasGit?: boolean;
  hasDockerCompose?: boolean;
  hasEnvFile?: boolean;
  gitBranch?: string;
}

export interface FolderScanResult {
  hasGit: boolean;
  hasDockerCompose: boolean;
  hasEnvFile: boolean;
  gitBranch: string | null;
}

export interface CreateProjectInput {
  name: string;
  rootPath: string;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
}

export interface DirNode {
  name: string;
  path: string;
  isDir: boolean;
  children: DirNode[];
}
