"use strict";

/* Shared HTTP helpers: auth middleware, upload handling, error types. */
const crypto = require("node:crypto");
const multer = require("multer");
const security = require("./security");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new HttpError(400, msg);
const notFound = (what = "Not found") => new HttpError(404, what);
const forbidden = (msg = "Forbidden") => new HttpError(403, msg);

function issueToken(ctx, user) {
  return security.sign(ctx.config.secretKey, {
    uid: user.id,
    t: "session",
    exp: Date.now() + ctx.config.auth.tokenTtlHours * 3600 * 1000,
  });
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, disabled: !!u.disabled, createdAt: u.created_at };
}

const API_KEY_PREFIX = "apkc_";

function hashApiKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** Resolves a personal API key (used by MCP clients and scripts) to its user. */
async function userFromApiKey(ctx, key) {
  const row = await ctx.db.get("SELECT * FROM api_keys WHERE key_hash = ?", [hashApiKey(key)]);
  if (!row) return null;
  const user = await ctx.db.get("SELECT * FROM users WHERE id = ?", [row.user_id]);
  if (!user || user.disabled) return null;
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60000) {
    await ctx.db.run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", [security.now(), row.id]);
  }
  return user;
}

function authenticate(ctx) {
  return async (req, res, next) => {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (token && token.startsWith(API_KEY_PREFIX)) {
      const user = await userFromApiKey(ctx, token);
      if (!user) return next(new HttpError(401, "Invalid or revoked API key"));
      req.user = user;
      req.authKind = "apikey";
      return next();
    }
    const payload = token && security.verify(ctx.config.secretKey, token);
    if (!payload || payload.t !== "session") return next(new HttpError(401, "Please sign in"));
    const user = await ctx.db.get("SELECT * FROM users WHERE id = ?", [payload.uid]);
    if (!user || user.disabled) return next(new HttpError(401, "Account not available"));
    req.user = user;
    req.authKind = "session";
    next();
  };
}

/** For account-level actions (managing API keys) that an API key must not perform. */
function requireSession(req, res, next) {
  if (req.authKind !== "session") return next(forbidden("Sign in to the web app to do this"));
  next();
}

/** Whether this user may create and build native Gradle projects (PROJECT_BUILDS policy). */
function canBuildProjects(ctx, user) {
  const policy = ctx.config.build.projectBuilds;
  return policy === "all" || (policy === "admin" && user && user.role === "admin");
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return next(forbidden("Administrator access required"));
  next();
}

/** Detect image type from magic bytes; never trust the client's MIME type. */
function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: "png", type: "image/png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", type: "image/webp" };
  if (buf.toString("ascii", 0, 4) === "GIF8") return { ext: "gif", type: "image/gif" };
  return null;
}

function uploader(ctx, maxMb = ctx.config.limits.maxUploadMb) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
  }).single("file");
}

/** Wrap async handlers so rejections reach the error middleware (Express 5 does this too). */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  HttpError, bad, notFound, forbidden, issueToken, publicUser, authenticate, requireAdmin, requireSession, canBuildProjects,
  sniffImage, uploader, h, API_KEY_PREFIX, hashApiKey,
};
