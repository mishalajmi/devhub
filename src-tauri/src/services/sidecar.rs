//! Sidecar lifecycle management.
//!
//! Spawns the `devhub-sidecar` binary as a managed child process via
//! `tauri_plugin_shell`, bridges its stdin/stdout for JSON-line IPC, and
//! forwards all events it emits to the frontend as `sidecar://event` Tauri
//! events.  Automatically attempts one restart if the sidecar exits
//! unexpectedly.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::oneshot;

/// Alias for the shared pending-request map type.
pub type PendingRequests = Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>;

/// Wraps the optional child process handle behind a shared mutex so it can be
/// safely accessed from multiple Tauri command handlers.
pub struct SidecarManager {
    child: Arc<Mutex<Option<CommandChild>>>,
}

impl SidecarManager {
    /// Create a new, idle manager (no child spawned yet).
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Spawn the `devhub-sidecar` binary, pipe its stdout/stderr, and begin
/// forwarding events to the frontend.  Replaces any previously held child.
///
/// `pending` is the shared map of in-flight request IDs to oneshot senders.
/// When a stdout line arrives with a matching `id`, it resolves the channel
/// directly instead of broadcasting via `sidecar://event`.
pub fn start(
    app: &AppHandle,
    manager: &SidecarManager,
    pending: PendingRequests,
) -> Result<()> {
    let (mut rx, child) = app
        .shell()
        .sidecar("devhub-sidecar")
        .map_err(|e| anyhow::anyhow!("sidecar command build failed: {e}"))?
        .spawn()
        .map_err(|e| anyhow::anyhow!("sidecar spawn failed: {e}"))?;

    {
        let mut guard = manager
            .child
            .lock()
            .map_err(|e| anyhow::anyhow!("sidecar mutex poisoned: {e}"))?;
        *guard = Some(child);
    }

    log::info!("[sidecar] process started");

    // Clone handles for the reader task.
    let app_handle = app.clone();
    let child_arc = Arc::clone(&manager.child);
    let pending_arc = Arc::clone(&pending);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    match serde_json::from_str::<Value>(text.trim()) {
                        Ok(payload) => {
                            // If the message has an `id` field that matches a
                            // pending request, resolve the channel and skip the
                            // broadcast — this is a request-response pair.
                            if let Some(id) = payload.get("id").and_then(|v| v.as_str()) {
                                let maybe_tx = pending_arc
                                    .lock()
                                    .ok()
                                    .and_then(|mut map| map.remove(id));

                                if let Some(tx) = maybe_tx {
                                    // Ignore send errors — the receiver may have
                                    // already timed out and cleaned up.
                                    let _ = tx.send(payload);
                                    continue;
                                }
                            }

                            // No pending match — forward as a streaming event.
                            if let Err(e) = app_handle.emit("sidecar://event", &payload) {
                                log::warn!("[sidecar] emit error: {e}");
                            }
                        }
                        Err(e) => {
                            log::warn!("[sidecar] stdout parse error: {e} — raw: {text}");
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    log::debug!("[sidecar] stderr: {}", text.trim_end());
                }
                CommandEvent::Error(e) => {
                    log::error!("[sidecar] process error: {e}");
                }
                CommandEvent::Terminated(status) => {
                    let code = status.code.unwrap_or(-1);
                    log::warn!("[sidecar] exited with code {code}; scheduling restart in 1 s");

                    // Clear the stale child handle.
                    if let Ok(mut guard) = child_arc.lock() {
                        *guard = None;
                    }

                    // Attempt one restart after a short delay.
                    let app2 = app_handle.clone();
                    let child_arc2 = Arc::clone(&child_arc);
                    let pending2 = Arc::clone(&pending_arc);
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                        // Build a temporary manager wrapping the shared Arc so
                        // `start` can place the new child there.
                        let tmp = SidecarManager {
                            child: child_arc2,
                        };
                        if let Err(e) = start(&app2, &tmp, pending2) {
                            log::error!("[sidecar] restart failed: {e}");
                        } else {
                            log::info!("[sidecar] restarted successfully");
                        }
                    });

                    // Stop processing this stream — the new spawn gets its own.
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Write a JSON value as a newline-delimited message to the sidecar's stdin.
pub fn send(manager: &SidecarManager, message: Value) -> Result<()> {
    let mut guard = manager
        .child
        .lock()
        .map_err(|e| anyhow::anyhow!("sidecar mutex poisoned: {e}"))?;

    match guard.as_mut() {
        Some(child) => {
            let mut line = serde_json::to_string(&message)?;
            line.push('\n');
            child
                .write(line.as_bytes())
                .map_err(|e| anyhow::anyhow!("sidecar stdin write failed: {e}"))?;
            Ok(())
        }
        None => Err(anyhow::anyhow!("sidecar is not running")),
    }
}

/// Kill the sidecar child process and clear the stored handle.
pub fn stop(manager: &SidecarManager) -> Result<()> {
    let mut guard = manager
        .child
        .lock()
        .map_err(|e| anyhow::anyhow!("sidecar mutex poisoned: {e}"))?;

    if let Some(child) = guard.take() {
        child
            .kill()
            .map_err(|e| anyhow::anyhow!("sidecar kill failed: {e}"))?;
        log::info!("[sidecar] process stopped");
    }

    Ok(())
}
