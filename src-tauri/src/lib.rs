//! DevHub Tauri backend — library root.
//! Wires together plugins, app state, and command handlers.

mod commands;
mod db;
mod services;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;

/// Shared application state injected into all Tauri commands.
pub struct AppState {
    /// SQLite connection protected by a mutex for thread-safe access.
    pub db: Mutex<rusqlite::Connection>,
    /// Registry of active filesystem watchers (one per watched project).
    pub watcher_registry: Arc<Mutex<services::file_watcher::WatcherRegistry>>,
    /// Manages the Node.js sidecar child process lifecycle.
    pub sidecar: services::sidecar::SidecarManager,
    /// In-flight sidecar request channels, keyed by request ID.
    /// The sidecar stdout reader resolves these directly instead of
    /// broadcasting via `sidecar://event`.
    pub pending_requests: services::sidecar::PendingRequests,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Resolve the app data directory for the SQLite database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");
            std::fs::create_dir_all(&app_data_dir).expect("failed to create app data directory");

            let db_path = app_data_dir.join("devhub.db");
            let conn = db::init(&db_path).expect("failed to initialise database");

            let sidecar_manager = services::sidecar::SidecarManager::new();

            app.manage(AppState {
                db: Mutex::new(conn),
                watcher_registry: Arc::new(Mutex::new(
                    services::file_watcher::WatcherRegistry::new(),
                )),
                sidecar: sidecar_manager,
                pending_requests: Arc::new(Mutex::new(HashMap::default())),
            });

            // Start the sidecar immediately after app state is registered.
            let app_handle = app.handle().clone();
            let state = app_handle.state::<AppState>();
            if let Err(e) = services::sidecar::start(
                &app_handle,
                &state.sidecar,
                Arc::clone(&state.pending_requests),
            ) {
                log::warn!("sidecar failed to start at launch: {e}");
            }

            log::info!("DevHub started, DB at {:?}", db_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Project commands
            commands::project::list_projects,
            commands::project::get_project,
            commands::project::create_project,
            commands::project::update_project,
            commands::project::delete_project,
            commands::project::scan_project_folder,
            commands::project::list_dir_tree,
            commands::project::watch_project,
            commands::project::unwatch_project,
            // Agent session commands
            commands::agent::list_agent_sessions,
            commands::agent::create_agent_session,
            commands::agent::update_agent_session,
            commands::agent::delete_agent_session,
            // Sidecar commands
            commands::agent::start_sidecar,
            commands::agent::stop_sidecar,
            commands::agent::send_sidecar_message,
            // MCP server commands
            commands::mcp::list_mcp_servers,
            commands::mcp::create_mcp_server,
            commands::mcp::delete_mcp_server,
            commands::mcp::start_mcp_server,
            commands::mcp::stop_mcp_server,
            // Resource commands
            commands::resource::list_resources,
            commands::resource::create_resource,
            commands::resource::update_resource,
            commands::resource::delete_resource,
            // Skill commands
            commands::skill::list_skills,
            commands::skill::create_skill,
            commands::skill::update_skill,
            commands::skill::delete_skill,
            // Driver registry commands
            commands::driver::list_driver_manifests,
            commands::driver::load_local_driver,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DevHub");
}
