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

/** Result returned by the `scan_project_folder` Tauri command */
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

/** A node in the directory tree returned by list_dir_tree */
export interface DirNode {
  name: string;
  path: string;
  isDir: boolean;
  children: DirNode[];
}
