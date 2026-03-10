//! Tauri command handlers for agent session management.

use crate::db;
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateAgentSessionInput {
    pub project_id: String,
    pub agent_type: String,
    pub title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateAgentSessionInput {
    pub status: Option<String>,
    pub external_id: Option<String>,
    pub title: Option<String>,
}

/// List all agent sessions for a project.
#[tauri::command]
pub fn list_agent_sessions(
    project_id: String,
    state: tauri::State<AppState>,
) -> Result<Vec<db::AgentSessionRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_agent_sessions(&conn, &project_id).map_err(|e| e.to_string())
}

/// Create a new agent session record.
#[tauri::command]
pub fn create_agent_session(
    input: CreateAgentSessionInput,
    state: tauri::State<AppState>,
) -> Result<db::AgentSessionRow, String> {
    let now = Utc::now().to_rfc3339();
    let row = db::AgentSessionRow {
        id: Uuid::new_v4().to_string(),
        project_id: input.project_id,
        agent_type: input.agent_type,
        external_id: None,
        status: "idle".to_string(),
        title: input.title,
        created_at: now.clone(),
        updated_at: now,
    };
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_agent_session(&conn, &row).map_err(|e| e.to_string())?;
    Ok(row)
}

/// Update an agent session's status, external ID, or title.
#[tauri::command]
pub fn update_agent_session(
    id: String,
    updates: UpdateAgentSessionInput,
    state: tauri::State<AppState>,
) -> Result<db::AgentSessionRow, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let updated_at = Utc::now().to_rfc3339();

    // Fetch existing to merge fields
    let mut stmt = conn
        .prepare("SELECT id, project_id, agent_type, external_id, status, title, created_at, updated_at FROM agent_sessions WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let existing: db::AgentSessionRow = stmt
        .query_row([&id], |row| {
            Ok(db::AgentSessionRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                agent_type: row.get(2)?,
                external_id: row.get(3)?,
                status: row.get(4)?,
                title: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let new_status = updates.status.unwrap_or(existing.status.clone());
    let new_external_id = updates.external_id.or(existing.external_id.clone());
    let new_title = updates.title.or(existing.title.clone());

    db::update_agent_session(
        &conn,
        &id,
        &new_status,
        new_external_id.as_deref(),
        new_title.as_deref(),
        &updated_at,
    )
    .map_err(|e| e.to_string())?;

    Ok(db::AgentSessionRow {
        id: existing.id,
        project_id: existing.project_id,
        agent_type: existing.agent_type,
        external_id: new_external_id,
        status: new_status,
        title: new_title,
        created_at: existing.created_at,
        updated_at,
    })
}

/// Delete an agent session record.
#[tauri::command]
pub fn delete_agent_session(id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_agent_session(&conn, &id).map_err(|e| e.to_string())
}
