//! SQLite database setup and migration management.
//! All SQL queries in the application must go through this module.

use anyhow::Result;
use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use std::path::Path;

/// Initialise the SQLite database at the given path, run all pending migrations,
/// and return an open connection with WAL mode and foreign keys enabled.
pub fn init(db_path: &Path) -> Result<Connection> {
    let migrations = Migrations::new(vec![M::up(include_str!("migrations/001_init.sql"))]);

    let mut conn = Connection::open(db_path)?;

    // Enable WAL for better concurrent read performance
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    // Enforce foreign key constraints
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    migrations.to_latest(&mut conn)?;

    log::info!("Database initialised at {:?}", db_path);
    Ok(conn)
}

// ─── Projects ────────────────────────────────────────────────────────────────

/// Row representation of the `projects` table.
/// Serializes to camelCase JSON to match the TypeScript `Project` interface.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub created_at: String,
    pub updated_at: String,
}

/// List all projects ordered by name.
pub fn list_projects(conn: &Connection) -> Result<Vec<ProjectRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, root_path, created_at, updated_at FROM projects ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ProjectRow {
            id: row.get(0)?,
            name: row.get(1)?,
            root_path: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Get a single project by ID.
pub fn get_project(conn: &Connection, id: &str) -> Result<Option<ProjectRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, root_path, created_at, updated_at FROM projects WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], |row| {
        Ok(ProjectRow {
            id: row.get(0)?,
            name: row.get(1)?,
            root_path: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

/// Insert a new project row.
pub fn insert_project(conn: &Connection, row: &ProjectRow) -> Result<()> {
    conn.execute(
        "INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![row.id, row.name, row.root_path, row.created_at, row.updated_at],
    )?;
    Ok(())
}

/// Update a project's mutable fields.
pub fn update_project(conn: &Connection, id: &str, name: &str, updated_at: &str) -> Result<()> {
    conn.execute(
        "UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![name, updated_at, id],
    )?;
    Ok(())
}

/// Delete a project by ID (cascades to all child tables).
pub fn delete_project(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(())
}

// ─── Agent Sessions ───────────────────────────────────────────────────────────

/// Row representation of the `agent_sessions` table.
/// Serializes to camelCase JSON to match the TypeScript `AgentSession` interface.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionRow {
    pub id: String,
    pub project_id: String,
    pub agent_type: String,
    pub external_id: Option<String>,
    pub status: String,
    pub title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// List all agent sessions for a project.
pub fn list_agent_sessions(conn: &Connection, project_id: &str) -> Result<Vec<AgentSessionRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, agent_type, external_id, status, title, created_at, updated_at
         FROM agent_sessions WHERE project_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([project_id], |row| {
        Ok(AgentSessionRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            agent_type: row.get(2)?,
            external_id: row.get(3)?,
            status: row.get(4)?,
            title: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Insert a new agent session row.
pub fn insert_agent_session(conn: &Connection, row: &AgentSessionRow) -> Result<()> {
    conn.execute(
        "INSERT INTO agent_sessions (id, project_id, agent_type, external_id, status, title, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            row.id, row.project_id, row.agent_type, row.external_id,
            row.status, row.title, row.created_at, row.updated_at
        ],
    )?;
    Ok(())
}

/// Update agent session status, external_id and/or title.
pub fn update_agent_session(
    conn: &Connection,
    id: &str,
    status: &str,
    external_id: Option<&str>,
    title: Option<&str>,
    updated_at: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE agent_sessions SET status = ?1, external_id = ?2, title = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![status, external_id, title, updated_at, id],
    )?;
    Ok(())
}

/// Delete an agent session.
pub fn delete_agent_session(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM agent_sessions WHERE id = ?1", [id])?;
    Ok(())
}

// ─── MCP Servers ─────────────────────────────────────────────────────────────

/// Row representation of the `mcp_servers` table.
/// Serializes to camelCase JSON to match the TypeScript `McpServer` interface.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerRow {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub command: String,
    pub args_json: String,
    pub env_json: String,
    pub port: Option<i64>,
    pub status: String,
    pub created_at: String,
}

/// List all MCP servers for a project.
pub fn list_mcp_servers(conn: &Connection, project_id: &str) -> Result<Vec<McpServerRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, command, args_json, env_json, port, status, created_at
         FROM mcp_servers WHERE project_id = ?1 ORDER BY name",
    )?;
    let rows = stmt.query_map([project_id], |row| {
        Ok(McpServerRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            command: row.get(3)?,
            args_json: row.get(4)?,
            env_json: row.get(5)?,
            port: row.get(6)?,
            status: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Insert a new MCP server row.
pub fn insert_mcp_server(conn: &Connection, row: &McpServerRow) -> Result<()> {
    conn.execute(
        "INSERT INTO mcp_servers (id, project_id, name, command, args_json, env_json, port, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            row.id, row.project_id, row.name, row.command,
            row.args_json, row.env_json, row.port, row.status, row.created_at
        ],
    )?;
    Ok(())
}

/// Update MCP server status and port.
pub fn update_mcp_server_status(
    conn: &Connection,
    id: &str,
    status: &str,
    port: Option<i64>,
) -> Result<()> {
    conn.execute(
        "UPDATE mcp_servers SET status = ?1, port = ?2 WHERE id = ?3",
        rusqlite::params![status, port, id],
    )?;
    Ok(())
}

/// Delete an MCP server row.
pub fn delete_mcp_server(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM mcp_servers WHERE id = ?1", [id])?;
    Ok(())
}

// ─── Resources ────────────────────────────────────────────────────────────────

/// Row representation of the `project_resources` table.
/// Serializes to camelCase JSON to match the TypeScript `ProjectResource` interface.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRow {
    pub id: String,
    pub project_id: String,
    pub resource_type: String,
    pub name: String,
    pub config_json: String,
    pub created_at: String,
}

/// List all resources for a project.
pub fn list_resources(conn: &Connection, project_id: &str) -> Result<Vec<ResourceRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, type, name, config_json, created_at
         FROM project_resources WHERE project_id = ?1 ORDER BY type, name",
    )?;
    let rows = stmt.query_map([project_id], |row| {
        Ok(ResourceRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            resource_type: row.get(2)?,
            name: row.get(3)?,
            config_json: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Insert a new resource row.
pub fn insert_resource(conn: &Connection, row: &ResourceRow) -> Result<()> {
    conn.execute(
        "INSERT INTO project_resources (id, project_id, type, name, config_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            row.id,
            row.project_id,
            row.resource_type,
            row.name,
            row.config_json,
            row.created_at
        ],
    )?;
    Ok(())
}

/// Get a single resource row by ID.
pub fn get_resource(conn: &Connection, id: &str) -> Result<Option<ResourceRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, type, name, config_json, created_at
         FROM project_resources WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], |row| {
        Ok(ResourceRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            resource_type: row.get(2)?,
            name: row.get(3)?,
            config_json: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

/// Update the name and config_json of an existing resource row.
pub fn update_resource(conn: &Connection, id: &str, name: &str, config_json: &str) -> Result<()> {
    conn.execute(
        "UPDATE project_resources SET name = ?1, config_json = ?2 WHERE id = ?3",
        rusqlite::params![name, config_json, id],
    )?;
    Ok(())
}

/// Delete a resource row.
pub fn delete_resource(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM project_resources WHERE id = ?1", [id])?;
    Ok(())
}

// ─── Skills ───────────────────────────────────────────────────────────────────

/// Row representation of the `skills` table.
/// Serializes to camelCase JSON to match the TypeScript `Skill` interface.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRow {
    pub id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub content: String,
    pub tags_json: String,
    pub created_at: String,
    pub updated_at: String,
}

/// List skills — if project_id is provided, returns global + project-scoped skills.
pub fn list_skills(conn: &Connection, project_id: Option<&str>) -> Result<Vec<SkillRow>> {
    let rows = if let Some(pid) = project_id {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, content, tags_json, created_at, updated_at
             FROM skills WHERE project_id IS NULL OR project_id = ?1 ORDER BY title",
        )?;
        let collected = stmt
            .query_map([pid], |row| {
                Ok(SkillRow {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    tags_json: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        collected
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, content, tags_json, created_at, updated_at
             FROM skills WHERE project_id IS NULL ORDER BY title",
        )?;
        let collected = stmt
            .query_map([], |row| {
                Ok(SkillRow {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    tags_json: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        collected
    };
    Ok(rows)
}

/// Insert a new skill row.
pub fn insert_skill(conn: &Connection, row: &SkillRow) -> Result<()> {
    conn.execute(
        "INSERT INTO skills (id, project_id, title, content, tags_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            row.id,
            row.project_id,
            row.title,
            row.content,
            row.tags_json,
            row.created_at,
            row.updated_at
        ],
    )?;
    Ok(())
}

/// Update a skill's mutable fields.
pub fn update_skill(
    conn: &Connection,
    id: &str,
    title: &str,
    content: &str,
    tags_json: &str,
    updated_at: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE skills SET title = ?1, content = ?2, tags_json = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![title, content, tags_json, updated_at, id],
    )?;
    Ok(())
}

/// Delete a skill.
pub fn delete_skill(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM skills WHERE id = ?1", [id])?;
    Ok(())
}
