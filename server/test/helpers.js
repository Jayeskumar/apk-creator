"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createServices } = require("../src/services");
const { createApp } = require("../src/app");

/** Boots a full API server on a random port with an isolated SQLite data dir. */
/*
 * Set TEST_DATABASE_URL=postgres://user:pass@host/db to run the suite against
 * PostgreSQL (a throwaway database is created per server); otherwise SQLite.
 */
async function createPgDatabase() {
  const { Client } = require("pg");
  const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  const name = `apkc_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await c.end();
    },
  };
}

async function startServer(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "apkc-test-"));
  const pg = process.env.TEST_DATABASE_URL ? await createPgDatabase() : null;
  const extra = {};
  for (const k of ["STORAGE_DRIVER", "S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_REGION", "S3_PREFIX"]) {
    if (process.env[`TEST_${k}`]) extra[k] = process.env[`TEST_${k}`];
  }
  if (extra.S3_PREFIX) extra.S3_PREFIX += `/${path.basename(dataDir)}`;
  const ctx = await createServices({
    DATA_DIR: dataDir, EMBEDDED_WORKER: "false", PUBLIC_URL: "http://apps.example.test",
    ...(pg ? { DATABASE_URL: pg.url } : {}), ...extra, ...env,
  });
  const app = createApp(ctx);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, url, { body, token, raw, headers = {} } = {}) {
    const h = { ...headers };
    if (token) h.authorization = `Bearer ${token}`;
    let payload = body;
    if (body !== undefined && !(body instanceof FormData) && typeof body !== "string") {
      h["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + url, { method, headers: h, body: payload });
    if (raw) return res;
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  }

  async function register(email, password = "password123", name) {
    const r = await call("POST", "/api/auth/register", { body: { email, password, name } });
    if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
    return r.body.token;
  }

  async function close() {
    await new Promise((r) => server.close(r));
    await ctx.db.close();
    if (pg) await pg.drop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  return { ctx, base, call, register, close, dataDir };
}

// 1x1 transparent PNG
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

module.exports = { startServer, PNG };
