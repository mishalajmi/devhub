//! Tauri command handlers for project resource management.

use crate::db;
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Input for creating a new resource. Deserializes from camelCase JSON.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResourceInput {
    pub project_id: String,
    pub resource_type: String,
    pub name: String,
    pub config_json: String,
}

/// Input for updating an existing resource's name and config. Deserializes from camelCase JSON.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResourceInput {
    pub id: String,
    pub name: String,
    pub config_json: String,
}

/// List all resources for a project.
#[tauri::command]
pub fn list_resources(
    project_id: String,
    state: tauri::State<AppState>,
) -> Result<Vec<db::ResourceRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_resources(&conn, &project_id).map_err(|e| e.to_string())
}

/// Create a new resource entry for a project.
#[tauri::command]
pub fn create_resource(
    input: CreateResourceInput,
    state: tauri::State<AppState>,
) -> Result<db::ResourceRow, String> {
    let row = db::ResourceRow {
        id: Uuid::new_v4().to_string(),
        project_id: input.project_id,
        resource_type: input.resource_type,
        name: input.name,
        config_json: input.config_json,
        created_at: Utc::now().to_rfc3339(),
    };
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_resource(&conn, &row).map_err(|e| e.to_string())?;
    Ok(row)
}

/// Update an existing resource's name and config, then return the updated row.
#[tauri::command]
pub fn update_resource(
    input: UpdateResourceInput,
    state: tauri::State<AppState>,
) -> Result<db::ResourceRow, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_resource(&conn, &input.id, &input.name, &input.config_json)
        .map_err(|e| e.to_string())?;
    db::get_resource(&conn, &input.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("resource {} not found after update", input.id))
}

/// Delete a resource entry.
#[tauri::command]
pub fn delete_resource(id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_resource(&conn, &id).map_err(|e| e.to_string())
}
