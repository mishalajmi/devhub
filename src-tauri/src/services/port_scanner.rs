//! Local port scanning to detect running services.
#![allow(dead_code)]
//! Full implementation in Chunk 22 (Resources — Local services panel).

use anyhow::Result;

/// Placeholder: scan for listening TCP ports.
/// Will be implemented in Chunk 22 using platform-specific socket enumeration.
pub fn scan_listening_ports() -> Result<Vec<u16>> {
    // TODO (Chunk 22): enumerate listening ports via platform APIs
    Ok(vec![])
}
