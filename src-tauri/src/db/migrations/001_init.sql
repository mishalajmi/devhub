-- DevHub initial schema
-- Migration 001: core tables

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  root_path   TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_resources (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK(type IN ('docker', 'service', 'database', 'cloud', 'env')),
  name        TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  command     TEXT NOT NULL,
  args_json   TEXT NOT NULL DEFAULT '[]',
  env_json    TEXT NOT NULL DEFAULT '{}',
  port        INTEGER,
  status      TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('running', 'stopped', 'error')),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  tags_json   TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_type    TEXT NOT NULL CHECK(agent_type IN ('opencode', 'claude')),
  external_id   TEXT,
  status        TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('running', 'idle', 'stopped', 'error')),
  title         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_resources_project ON project_resources(project_id);
CREATE INDEX IF NOT EXISTS idx_mcp_project ON mcp_servers(project_id);
CREATE INDEX IF NOT EXISTS idx_skills_project ON skills(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON agent_sessions(project_id);
