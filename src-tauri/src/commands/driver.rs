//! Tauri command handlers for agent driver registry management.
//!
//! These commands proxy requests to the Node.js sidecar via the pending-request
//! map pattern: a oneshot channel is registered before the message is sent so
//! the sidecar stdout reader can resolve it directly, bypassing the generic
//! `sidecar://event` broadcast.

use std::time::Duration;

use serde_json::{json, Value};
use tauri::State;
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::services::sidecar;
use crate::AppState;

// ─── Shared request helper ────────────────────────────────────────────────────

/// Send a typed request to the sidecar and wait for the matching response.
///
/// Registers a oneshot channel in `AppState::pending_requests` keyed by a
/// freshly generated UUID, writes the message to stdin, then awaits the
/// channel with a 10-second timeout.  Returns the raw `Value` on success or
/// a descriptive `String` error.
async fn sidecar_request(state: &AppState, msg_type: &str, payload: Value) -> Result<Value, String> {
    let id = Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel::<Value>();

    // Register the channel BEFORE sending so the response can never arrive
    // before we are listening.
    {
        let mut pending = state
            .pending_requests
            .lock()
            .map_err(|e| format!("pending_requests mutex poisoned: {e}"))?;
        pending.insert(id.clone(), tx);
    }

    sidecar::send(
        &state.sidecar,
        json!({ "id": id, "type": msg_type, "payload": payload }),
    )
    .map_err(|e| e.to_string())?;

    // Await the response, removing the registration on any failure path.
    let response = tokio::time::timeout(Duration::from_secs(10), rx)
        .await
        .map_err(|_| {
            // Timeout — clean up the dangling sender slot.
            if let Ok(mut pending) = state.pending_requests.lock() {
                pending.remove(&id);
            }
            "sidecar request timed out after 10 s".to_string()
        })?
        .map_err(|_| "sidecar channel closed before response arrived".to_string())?;

    // The sidecar always responds with { id, ok, result|error }.
    if response["ok"].as_bool() == Some(true) {
        Ok(response["result"].clone())
    } else {
        Err(response["error"]
            .as_str()
            .unwrap_or("unknown sidecar error")
            .to_string())
    }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// List all agent driver manifests currently registered in the sidecar.
#[tauri::command]
pub async fn list_driver_manifests(
    state: State<'_, AppState>,
) -> Result<Vec<Value>, String> {
    let result = sidecar_request(&state, "drivers:list", json!({})).await?;
    serde_json::from_value::<Vec<Value>>(result).map_err(|e| e.to_string())
}

/// Load a local agent driver from an absolute file path via the sidecar.
/// Returns the manifest of the newly registered driver.
#[tauri::command]
pub async fn load_local_driver(
    path: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    sidecar_request(&state, "drivers:load", json!({ "path": path })).await
}
