"use strict";

/*
 * Tiny database abstraction with two drivers:
 *   - sqlite   (node:sqlite, zero external services; default for on-premise)
 *   - postgres (pg; used in the cloud and for multi-node on-premise installs)
 *
 * Queries are written once with "?" placeholders and translated per driver.
 */
const fs = require("node:fs");
const path = require("node:path");
const migrations = require("./schema");

class SqliteDb {
  constructor(file) {
    const { DatabaseSync } = require("node:sqlite");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.driver = "sqlite";
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  }
  async get(sql, params = []) {
    const row = this.db.prepare(sql).get(...params.map(norm));
    return row ? { ...row } : undefined;
  }
  async all(sql, params = []) {
    return this.db.prepare(sql).all(...params.map(norm)).map((r) => ({ ...r }));
  }
  async run(sql, params = []) {
    const res = this.db.prepare(sql).run(...params.map(norm));
    return { changes: Number(res.changes) };
  }
  async exec(sql) {
    this.db.exec(sql);
  }
  async claimNextBuild(workerId, now) {
    // SQLite serialises writers, so a single UPDATE ... RETURNING is atomic.
    const row = this.db.prepare(
      `UPDATE builds SET status = 'building', worker_id = ?, started_at = ?, heartbeat_at = ?
       WHERE id = (SELECT id FROM builds WHERE status = 'queued' ORDER BY created_at LIMIT 1)
       RETURNING *`
    ).get(workerId, now, now);
    return row ? { ...row } : null;
  }
  async close() {
    this.db.close();
  }
}

class PostgresDb {
  constructor(url, ssl) {
    const { Pool } = require("pg");
    this.driver = "postgres";
    this.pool = new Pool({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : undefined, max: 10 });
  }
  static translate(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }
  async get(sql, params = []) {
    const res = await this.pool.query(PostgresDb.translate(sql), params.map(norm));
    return res.rows[0];
  }
  async all(sql, params = []) {
    const res = await this.pool.query(PostgresDb.translate(sql), params.map(norm));
    return res.rows;
  }
  async run(sql, params = []) {
    const res = await this.pool.query(PostgresDb.translate(sql), params.map(norm));
    return { changes: res.rowCount };
  }
  async exec(sql) {
    await this.pool.query(sql);
  }
  async claimNextBuild(workerId, now) {
    // SKIP LOCKED lets many build workers poll the same queue safely.
    const res = await this.pool.query(
      `UPDATE builds SET status = 'building', worker_id = $1, started_at = $2, heartbeat_at = $2
       WHERE id = (SELECT id FROM builds WHERE status = 'queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING *`,
      [workerId, now]
    );
    return res.rows[0] || null;
  }
  async close() {
    await this.pool.end();
  }
}

function norm(v) {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

async function migrate(db) {
  await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)");
  const row = await db.get("SELECT MAX(version) AS v FROM schema_migrations");
  const current = row && row.v != null ? Number(row.v) : 0;
  for (let i = current; i < migrations.length; i++) {
    await db.exec(migrations[i]);
    await db.run("INSERT INTO schema_migrations (version) VALUES (?)", [i + 1]);
  }
}

async function open(config) {
  const db = config.database.driver === "postgres"
    ? new PostgresDb(config.database.url, config.database.ssl)
    : new SqliteDb(config.database.sqlitePath);
  await migrate(db);
  return db;
}

module.exports = { open, PostgresDb, SqliteDb };
