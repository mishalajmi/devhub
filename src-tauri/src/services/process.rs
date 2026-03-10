//! Child process management for MCP servers.
#![allow(dead_code)]
//! Full implementation in Chunk 15 (MCP — server registry + process spawner).

use anyhow::Result;
use std::collections::HashMap;

/// Handle to a spawned child process.
pub struct ProcessHandle {
    pub pid: u32,
    pub port: Option<u16>,
}

/// Placeholder: spawn an MCP server as a child process.
/// Will be implemented in Chunk 15.
pub fn spawn_mcp_server(
    _command: &str,
    _args: &[String],
    _env: &HashMap<String, String>,
    _port: Option<u16>,
) -> Result<ProcessHandle> {
    // TODO (Chunk 15): spawn process, assign port from pool 5100–5200, track handle
    Err(anyhow::anyhow!(
        "MCP process spawning not yet implemented — see Chunk 15"
    ))
}

/// Placeholder: stop a child process by PID.
pub fn stop_process(_pid: u32) -> Result<()> {
    // TODO (Chunk 15): send SIGTERM / TerminateProcess and wait
    Ok(())
}
