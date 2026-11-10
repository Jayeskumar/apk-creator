"use strict";

/*
 * Central configuration. Everything is driven by environment variables so the
 * exact same build runs on-premise (single box, SQLite, local disk, embedded
 * build worker) or in the cloud (Postgres, S3-compatible storage, separately
 * scaled build workers).
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..", "..");

function bool(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function load(env = process.env) {
  const mode = (env.DEPLOYMENT_MODE || "onprem").toLowerCase() === "cloud" ? "cloud" : "onprem";
  const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT, "data"));
  const port = int(env.PORT, 8080);

  const cfg = {
    mode,
    port,
    host: env.HOST || "0.0.0.0",
    publicUrl: (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, ""),
    dataDir,
    brandName: env.BRAND_NAME || "APK Creator",

    database: {
      url: env.DATABASE_URL || "",
      driver: env.DATABASE_URL && /^postgres(ql)?:/.test(env.DATABASE_URL) ? "postgres" : "sqlite",
      sqlitePath: path.resolve(env.SQLITE_PATH || path.join(dataDir, "apk-creator.db")),
      ssl: bool(env.DATABASE_SSL, false),
    },

    storage: {
      driver: (env.STORAGE_DRIVER || "local").toLowerCase(),
      localDir: path.resolve(env.STORAGE_DIR || path.join(dataDir, "storage")),
      s3: {
        bucket: env.S3_BUCKET || "",
        region: env.S3_REGION || "us-east-1",
        endpoint: env.S3_ENDPOINT || undefined,
        accessKeyId: env.S3_ACCESS_KEY_ID || undefined,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY || undefined,
        forcePathStyle: bool(env.S3_FORCE_PATH_STYLE, !!env.S3_ENDPOINT),
        prefix: (env.S3_PREFIX || "").replace(/^\/+|\/+$/g, ""),
      },
    },

    auth: {
      allowSignup: bool(env.ALLOW_SIGNUP, true),
      tokenTtlHours: int(env.TOKEN_TTL_HOURS, 24 * 7),
      adminEmail: env.ADMIN_EMAIL || "",
      adminPassword: env.ADMIN_PASSWORD || "",
    },

    limits: {
      maxAppsPerUser: int(env.MAX_APPS_PER_USER, mode === "cloud" ? 10 : 0),
      maxBuildsPerDay: int(env.MAX_BUILDS_PER_DAY, mode === "cloud" ? 20 : 0),
      maxUploadMb: int(env.MAX_UPLOAD_MB, 5),
      maxConfigKb: int(env.MAX_CONFIG_KB, 512),
    },

    worker: {
      embedded: bool(env.EMBEDDED_WORKER, mode === "onprem"),
      concurrency: Math.max(1, int(env.WORKER_CONCURRENCY, 1)),
      pollMs: int(env.WORKER_POLL_MS, 2000),
      id: env.WORKER_ID || `${require("node:os").hostname()}-${process.pid}`,
      staleAfterMinutes: int(env.BUILD_STALE_MINUTES, 30),
    },

    build: {
      templateDir: path.resolve(env.ANDROID_TEMPLATE_DIR || path.join(ROOT, "android-template")),
      runtimeDir: path.resolve(env.RUNTIME_DIR || path.join(ROOT, "runtime")),
      workDir: path.resolve(env.BUILD_WORK_DIR || path.join(dataDir, "builds")),
      gradleCmd: env.GRADLE_CMD || "gradle",
      gradleArgs: (env.GRADLE_ARGS || "").split(/\s+/).filter(Boolean),
      gradleOffline: bool(env.GRADLE_OFFLINE, false),
      timeoutSeconds: int(env.BUILD_TIMEOUT_SECONDS, 900),
      keepWorkDirs: bool(env.KEEP_BUILD_DIRS, false),
      keytoolCmd: env.KEYTOOL_CMD || "keytool",
      androidHome: env.ANDROID_HOME || env.ANDROID_SDK_ROOT || "",
    },

    webDir: path.resolve(env.WEB_DIR || path.join(ROOT, "web")),
    extraTemplatesDir: env.TEMPLATES_DIR ? path.resolve(env.TEMPLATES_DIR) : path.join(ROOT, "templates"),
    trustProxy: bool(env.TRUST_PROXY, mode === "cloud"),
  };

  cfg.secretKey = resolveSecret(env, cfg);
  return cfg;
}

/*
 * The secret signs auth tokens and encrypts signing-key passwords. In the
 * cloud it must be provided (all replicas need the same value). On-premise we
 * generate one on first start and persist it in the data directory.
 */
function resolveSecret(env, cfg) {
  if (env.SECRET_KEY) return env.SECRET_KEY;
  if (cfg.mode === "cloud" && env.NODE_ENV === "production") {
    throw new Error("SECRET_KEY must be set when DEPLOYMENT_MODE=cloud");
  }
  const file = path.join(cfg.dataDir, "secret.key");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    const secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

module.exports = { load, ROOT };
