//! Docker integration via the bollard crate.
#![allow(dead_code)]
//! Full implementation in Chunk 21 (Resources — Docker panel).

use anyhow::Result;

/// Placeholder: list running Docker containers.
/// Will be implemented in Chunk 21 using the bollard async Docker API.
pub async fn list_containers() -> Result<Vec<serde_json::Value>> {
    // TODO (Chunk 21): connect to Docker daemon via bollard and list containers
    Ok(vec![])
}
