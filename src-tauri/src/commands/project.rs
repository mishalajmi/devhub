//! Tauri command handlers for project management.
//! Handlers delegate to the db module; no business logic lives here.

use crate::db;
use crate::services::file_watcher;
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Maximum depth for directory tree traversal to avoid unbounded recursion.
const DIR_TREE_MAX_DEPTH: usize = 6;

/// Deserializes from camelCase JSON sent by the TypeScript frontend.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub name: String,
    pub root_path: String,
}

/// Deserializes from camelCase JSON sent by the TypeScript frontend.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectInput {
    pub id: String,
    pub name: Option<String>,
}

/// List all projects stored in the local database.
#[tauri::command]
pub fn list_projects(state: tauri::State<AppState>) -> Result<Vec<db::ProjectRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_projects(&conn).map_err(|e| e.to_string())
}

/// Get a single project by ID.
#[tauri::command]
pub fn get_project(
    id: String,
    state: tauri::State<AppState>,
) -> Result<Option<db::ProjectRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_project(&conn, &id).map_err(|e| e.to_string())
}

/// Create a new project from a folder path.
#[tauri::command]
pub fn create_project(
    input: CreateProjectInput,
    state: tauri::State<AppState>,
) -> Result<db::ProjectRow, String> {
    let now = Utc::now().to_rfc3339();
    let row = db::ProjectRow {
        id: Uuid::new_v4().to_string(),
        name: input.name,
        root_path: input.root_path,
        created_at: now.clone(),
        updated_at: now,
    };
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_project(&conn, &row).map_err(|e| e.to_string())?;
    Ok(row)
}

/// Update a project's name.
#[tauri::command]
pub fn update_project(
    input: UpdateProjectInput,
    state: tauri::State<AppState>,
) -> Result<db::ProjectRow, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let existing = db::get_project(&conn, &input.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Project {} not found", input.id))?;

    let new_name = input.name.unwrap_or(existing.name.clone());
    let updated_at = Utc::now().to_rfc3339();
    db::update_project(&conn, &input.id, &new_name, &updated_at).map_err(|e| e.to_string())?;

    Ok(db::ProjectRow {
        id: existing.id,
        name: new_name,
        root_path: existing.root_path,
        created_at: existing.created_at,
        updated_at,
    })
}

/// Delete a project and all its associated data.
#[tauri::command]
pub fn delete_project(id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_project(&conn, &id).map_err(|e| e.to_string())
}

/// Begin watching a project's root directory for relevant filesystem changes.
///
/// Emits `project://changed` to the frontend whenever `.git/HEAD`,
/// `docker-compose.yml`, or `.env` is created, modified, or removed.
/// Replaces any existing watcher registered for the same `project_id`.
#[tauri::command]
pub fn watch_project(
    project_id: String,
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let project = db::get_project(&conn, &project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Project {} not found", project_id))?;
    drop(conn);

    let root = std::path::Path::new(&project.root_path);
    file_watcher::start_watching(
        std::sync::Arc::clone(&state.watcher_registry),
        app,
        project_id,
        root,
    )
    .map_err(|e| e.to_string())
}

/// Stop watching the project identified by `project_id`.
///
/// Safe to call when no watcher is active for the project.
#[tauri::command]
pub fn unwatch_project(project_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    file_watcher::stop_watching(std::sync::Arc::clone(&state.watcher_registry), &project_id)
        .map_err(|e| e.to_string())
}

/// Scan a folder path and return detected project metadata (git, docker-compose, .env).
#[tauri::command]
pub fn scan_project_folder(path: String) -> Result<serde_json::Value, String> {
    use std::path::Path;

    let root = Path::new(&path);
    let has_git = root.join(".git").exists();
    let has_docker_compose = root.join("docker-compose.yml").exists()
        || root.join("docker-compose.yaml").exists()
        || root.join("compose.yml").exists()
        || root.join("compose.yaml").exists();
    let has_env_file = root.join(".env").exists();

    // Attempt to read current git branch
    let git_branch = if has_git {
        std::fs::read_to_string(root.join(".git/HEAD"))
            .ok()
            .and_then(|s| {
                s.trim()
                    .strip_prefix("ref: refs/heads/")
                    .map(|b| b.to_string())
            })
    } else {
        None
    };

    Ok(serde_json::json!({
        "hasGit": has_git,
        "hasDockerCompose": has_docker_compose,
        "hasEnvFile": has_env_file,
        "gitBranch": git_branch,
    }))
}

/// A node in the directory tree returned by `list_dir_tree`.
#[derive(Debug, Serialize, Deserialize)]
pub struct DirNode {
    /// Entry name (not full path)
    pub name: String,
    /// Absolute path to this entry
    pub path: String,
    /// Whether this entry is a directory
    pub is_dir: bool,
    /// Child nodes (empty for files or when max depth is reached)
    pub children: Vec<DirNode>,
}

/// Recursively build a directory tree up to `max_depth` levels deep.
fn build_tree(dir: &std::path::Path, current_depth: usize, max_depth: usize) -> Vec<DirNode> {
    if current_depth >= max_depth {
        return vec![];
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };
    let mut nodes: Vec<DirNode> = entries
        .filter_map(|e| e.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            // Skip hidden entries (dotfiles/dotdirs) except .env
            if name.starts_with('.') && name != ".env" {
                return None;
            }
            let is_dir = path.is_dir();
            let children = if is_dir {
                build_tree(&path, current_depth + 1, max_depth)
            } else {
                vec![]
            };
            Some(DirNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                children,
            })
        })
        .collect();
    // Sort: directories first, then files, both alphabetically
    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    nodes
}

/// List the directory tree of a project root path.
/// Returns up to `DIR_TREE_MAX_DEPTH` levels deep, skipping hidden entries.
#[tauri::command]
pub fn list_dir_tree(root_path: String) -> Result<Vec<DirNode>, String> {
    let root = std::path::Path::new(&root_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", root_path));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", root_path));
    }
    Ok(build_tree(root, 0, DIR_TREE_MAX_DEPTH))
}
