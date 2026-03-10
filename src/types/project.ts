export interface Project {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  // Detected metadata (not persisted, populated by scanner)
  hasGit?: boolean;
  hasDockerCompose?: boolean;
  hasEnvFile?: boolean;
  gitBranch?: string;
}

export interface CreateProjectInput {
  name: string;
  rootPath: string;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
}
