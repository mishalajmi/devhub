//! Tauri command handlers for MCP server registry management.

use crate::db;
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Deserializes from camelCase JSON sent by the TypeScript frontend.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMcpServerInput {
    pub project_id: String,
    pub name: String,
    pub command: String,
    pub args: Option<Vec<String>>,
    pub env: Option<std::collections::HashMap<String, String>>,
}

/// Deserializes from camelCase JSON sent by the TypeScript frontend.
#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMcpServerInput {
    pub id: String,
    pub name: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<std::collections::HashMap<String, String>>,
}

/// List all MCP servers for a project.
#[tauri::command]
pub fn list_mcp_servers(
    project_id: String,
    state: tauri::State<AppState>,
) -> Result<Vec<db::McpServerRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_mcp_servers(&conn, &project_id).map_err(|e| e.to_string())
}

/// Create a new MCP server configuration.
#[tauri::command]
pub fn create_mcp_server(
    input: CreateMcpServerInput,
    state: tauri::State<AppState>,
) -> Result<db::McpServerRow, String> {
    let args_json =
        serde_json::to_string(&input.args.unwrap_or_default()).map_err(|e| e.to_string())?;
    let env_json =
        serde_json::to_string(&input.env.unwrap_or_default()).map_err(|e| e.to_string())?;

    let row = db::McpServerRow {
        id: Uuid::new_v4().to_string(),
        project_id: input.project_id,
        name: input.name,
        command: input.command,
        args_json,
        env_json,
        port: None,
        status: "stopped".to_string(),
        created_at: Utc::now().to_rfc3339(),
    };
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_mcp_server(&conn, &row).map_err(|e| e.to_string())?;
    Ok(row)
}

/// Delete an MCP server configuration (stops the process first if running).
#[tauri::command]
pub fn delete_mcp_server(id: String, state: tauri::State<AppState>) -> Result<(), String> {
    // Stop process if running (process management will be wired in Chunk 15)
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_mcp_server(&conn, &id).map_err(|e| e.to_string())
}

/// Start an MCP server process.
/// Full process spawning logic is implemented in Chunk 15 (services/process.rs).
#[tauri::command]
pub fn start_mcp_server(
    id: String,
    state: tauri::State<AppState>,
) -> Result<db::McpServerRow, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    // TODO (Chunk 15): spawn child process via services::process
    db::update_mcp_server_status(&conn, &id, "running", None).map_err(|e| e.to_string())?;
    // Return updated row
    db::list_mcp_servers(&conn, "")
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("MCP server {} not found", id))
}

/// Stop an MCP server process.
#[tauri::command]
pub fn stop_mcp_server(
    id: String,
    state: tauri::State<AppState>,
) -> Result<db::McpServerRow, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    // TODO (Chunk 15): kill child process via services::process
    db::update_mcp_server_status(&conn, &id, "stopped", None).map_err(|e| e.to_string())?;
    db::list_mcp_servers(&conn, "")
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("MCP server {} not found", id))
}
