//! Filesystem watcher using the `notify` crate.
#![allow(dead_code)]
//! Full implementation in Chunk 7 (Projects — file watcher).

use anyhow::Result;

/// Placeholder: watch a project root path for changes.
/// Will be implemented in Chunk 7 using `notify::recommended_watcher`.
pub fn watch_path(_path: &std::path::Path) -> Result<()> {
    // TODO (Chunk 7): set up notify watcher and emit Tauri events on changes
    Ok(())
}
