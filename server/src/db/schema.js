"use strict";

/*
 * Portable schema shared by SQLite (on-premise) and PostgreSQL (cloud).
 * Only TEXT / INTEGER / BIGINT columns are used, timestamps are ISO-8601
 * strings and JSON documents are stored as TEXT, so the same SQL works on
 * both engines. Append new migrations to the end of the list.
 */
module.exports = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    package_name TEXT NOT NULL UNIQUE,
    template_id TEXT NOT NULL DEFAULT '',
    config TEXT NOT NULL,
    icon_key TEXT,
    version_code INTEGER NOT NULL DEFAULT 0,
    version_name TEXT NOT NULL DEFAULT '1.0.0',
    keystore TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_apps_user ON apps(user_id)`,
  `CREATE TABLE IF NOT EXISTS builds (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'apk',
    version_code INTEGER NOT NULL,
    version_name TEXT NOT NULL,
    package_name TEXT NOT NULL,
    app_name TEXT NOT NULL,
    icon_key TEXT,
    config TEXT NOT NULL,
    log TEXT NOT NULL DEFAULT '',
    error TEXT,
    artifact_key TEXT,
    artifact_size BIGINT,
    sha256 TEXT,
    worker_id TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    heartbeat_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_builds_app ON builds(app_id)`,
  `CREATE INDEX IF NOT EXISTS idx_builds_status ON builds(status, created_at)`,
  `CREATE TABLE IF NOT EXISTS media (
    media_key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    data TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_leads_app ON leads(app_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS custom_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'star',
    config TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
];
