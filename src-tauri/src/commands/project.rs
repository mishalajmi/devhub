//! Tauri command handlers for project management.
//! Handlers delegate to the db module; no business logic lives here.

use crate::db;
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectInput {
    pub name: String,
    pub root_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
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
