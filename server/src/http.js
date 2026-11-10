"use strict";

/* Shared HTTP helpers: auth middleware, upload handling, error types. */
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

function authenticate(ctx) {
  return async (req, res, next) => {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const payload = token && security.verify(ctx.config.secretKey, token);
    if (!payload || payload.t !== "session") return next(new HttpError(401, "Please sign in"));
    const user = await ctx.db.get("SELECT * FROM users WHERE id = ?", [payload.uid]);
    if (!user || user.disabled) return next(new HttpError(401, "Account not available"));
    req.user = user;
    next();
  };
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

function uploader(ctx) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: ctx.config.limits.maxUploadMb * 1024 * 1024, files: 1 },
  }).single("file");
}

/** Wrap async handlers so rejections reach the error middleware (Express 5 does this too). */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, bad, notFound, forbidden, issueToken, publicUser, authenticate, requireAdmin, sniffImage, uploader, h };
