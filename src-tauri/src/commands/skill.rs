//! Tauri command handlers for the prompt skill library.

use crate::db;
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSkillInput {
    pub project_id: Option<String>,
    pub title: String,
    pub content: String,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSkillInput {
    pub id: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub tags: Option<Vec<String>>,
}

/// List skills. If project_id is provided, returns global + project-scoped skills.
#[tauri::command]
pub fn list_skills(
    project_id: Option<String>,
    state: tauri::State<AppState>,
) -> Result<Vec<db::SkillRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_skills(&conn, project_id.as_deref()).map_err(|e| e.to_string())
}

/// Create a new skill.
#[tauri::command]
pub fn create_skill(
    input: CreateSkillInput,
    state: tauri::State<AppState>,
) -> Result<db::SkillRow, String> {
    let tags_json =
        serde_json::to_string(&input.tags.unwrap_or_default()).map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let row = db::SkillRow {
        id: Uuid::new_v4().to_string(),
        project_id: input.project_id,
        title: input.title,
        content: input.content,
        tags_json,
        created_at: now.clone(),
        updated_at: now,
    };
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_skill(&conn, &row).map_err(|e| e.to_string())?;
    Ok(row)
}

/// Update a skill's title, content, or tags.
#[tauri::command]
pub fn update_skill(
    input: UpdateSkillInput,
    state: tauri::State<AppState>,
) -> Result<db::SkillRow, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, title, content, tags_json, created_at, updated_at \
             FROM skills WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let existing: db::SkillRow = stmt
        .query_row([&input.id], |row| {
            Ok(db::SkillRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                tags_json: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let new_title = input.title.unwrap_or(existing.title.clone());
    let new_content = input.content.unwrap_or(existing.content.clone());
    let new_tags_json = match input.tags {
        Some(t) => serde_json::to_string(&t).map_err(|e| e.to_string())?,
        None => existing.tags_json.clone(),
    };
    let updated_at = Utc::now().to_rfc3339();

    db::update_skill(
        &conn,
        &input.id,
        &new_title,
        &new_content,
        &new_tags_json,
        &updated_at,
    )
    .map_err(|e| e.to_string())?;

    Ok(db::SkillRow {
        id: existing.id,
        project_id: existing.project_id,
        title: new_title,
        content: new_content,
        tags_json: new_tags_json,
        created_at: existing.created_at,
        updated_at,
    })
}

/// Delete a skill.
#[tauri::command]
pub fn delete_skill(id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_skill(&conn, &id).map_err(|e| e.to_string())
}
