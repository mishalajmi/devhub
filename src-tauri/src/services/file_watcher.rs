//! Filesystem watcher using the `notify` crate.
//!
//! Manages per-project watchers that detect relevant file changes
//! (`.git/HEAD`, `docker-compose.yml`, `.env`) and notify the Tauri
//! frontend via the `project://changed` event.

use anyhow::Result;
use notify::{
    event::{AccessKind, AccessMode, ModifyKind},
    recommended_watcher, Event, EventKind, RecursiveMode, Watcher,
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter};

/// Files within a project root that trigger a re-scan when modified.
const WATCHED_FILE_NAMES: &[&str] = &[
    ".git/HEAD",
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
    ".env",
];

/// Payload emitted to the frontend on `project://changed`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectChangedPayload {
    /// The project ID that changed.
    pub project_id: String,
    /// Absolute path of the file that triggered the change.
    pub changed_path: String,
}

/// Holds an active `notify` watcher for a single project.
struct ActiveWatcher {
    /// The watcher must be kept alive; dropping it stops watching.
    _watcher: Box<dyn Watcher + Send>,
}

/// Registry of all active project watchers.
///
/// Stored in `AppState` and shared across threads via `Arc<Mutex<...>>`.
#[derive(Default)]
pub struct WatcherRegistry {
    watchers: HashMap<String, ActiveWatcher>,
}

impl WatcherRegistry {
    /// Create a new, empty registry.
    pub fn new() -> Self {
        Self {
            watchers: HashMap::new(),
        }
    }
}

/// Start watching the given `root_path` for a project identified by `project_id`.
///
/// When a relevant file changes the service emits a `project://changed` Tauri
/// event so the frontend can refresh project indicators.  Any previously
/// registered watcher for the same `project_id` is stopped first.
pub fn start_watching(
    registry: Arc<Mutex<WatcherRegistry>>,
    app: AppHandle,
    project_id: String,
    root_path: &Path,
) -> Result<()> {
    let root_path = root_path.to_path_buf();

    // Build the set of absolute paths we care about.
    let watched_paths: Vec<PathBuf> = WATCHED_FILE_NAMES
        .iter()
        .map(|name| root_path.join(name))
        .collect();

    let project_id_clone = project_id.clone();

    let mut watcher = recommended_watcher(move |res: notify::Result<Event>| {
        let event = match res {
            Ok(e) => e,
            Err(err) => {
                log::warn!(
                    "file_watcher: notify error for project {}: {}",
                    project_id_clone,
                    err
                );
                return;
            }
        };

        // Only act on create / modify / remove / access-close-write events.
        let is_relevant_kind = matches!(
            event.kind,
            EventKind::Create(_)
                | EventKind::Remove(_)
                | EventKind::Modify(ModifyKind::Data(_))
                | EventKind::Modify(ModifyKind::Name(_))
                | EventKind::Access(AccessKind::Close(AccessMode::Write))
        );
        if !is_relevant_kind {
            return;
        }

        // Filter to only the files we care about.
        for changed in &event.paths {
            // Normalise the changed path for comparison.
            let changed_norm = dunce::canonicalize(changed).unwrap_or_else(|_| changed.clone());

            let is_watched = watched_paths.iter().any(|wp| {
                let wp_norm = dunce::canonicalize(wp).unwrap_or_else(|_| wp.clone());
                wp_norm == changed_norm
            });

            // Also accept if the changed path is directly inside the root and
            // matches one of our target file names.
            let matches_by_name = changed
                .file_name()
                .and_then(|n| n.to_str())
                .map(|name| {
                    WATCHED_FILE_NAMES
                        .iter()
                        .any(|wf| Path::new(wf).file_name().and_then(|f| f.to_str()) == Some(name))
                })
                .unwrap_or(false);

            if is_watched || matches_by_name {
                let payload = ProjectChangedPayload {
                    project_id: project_id_clone.clone(),
                    changed_path: changed.to_string_lossy().into_owned(),
                };
                log::info!(
                    "file_watcher: project {} changed ({})",
                    project_id_clone,
                    payload.changed_path
                );
                if let Err(e) = app.emit("project://changed", &payload) {
                    log::warn!("file_watcher: failed to emit event: {}", e);
                }
                break;
            }
        }
    })?;

    // Watch the root path non-recursively; `.git/HEAD` sits one level deep.
    // We watch recursively so that `.git/HEAD` (inside `.git/`) is captured.
    watcher.watch(&root_path, RecursiveMode::Recursive)?;

    let active = ActiveWatcher {
        _watcher: Box::new(watcher),
    };

    let mut reg = registry.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
    reg.watchers.insert(project_id, active);

    Ok(())
}

/// Stop watching the project identified by `project_id`.
///
/// Safe to call even if no watcher is registered for that project.
pub fn stop_watching(registry: Arc<Mutex<WatcherRegistry>>, project_id: &str) -> Result<()> {
    let mut reg = registry.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
    if reg.watchers.remove(project_id).is_some() {
        log::info!("file_watcher: stopped watching project {}", project_id);
    }
    Ok(())
}
