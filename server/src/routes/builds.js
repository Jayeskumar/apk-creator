"use strict";

const express = require("express");
const security = require("../security");
const { notFound, HttpError, authenticate, h } = require("../http");

function downloadToken(ctx, build) {
  return security.sign(ctx.config.secretKey, { t: "dl", b: build.id, exp: Date.now() + 24 * 3600 * 1000 });
}

function serializeBuild(ctx, b) {
  const out = {
    id: b.id,
    appId: b.app_id,
    status: b.status,
    format: b.format,
    versionCode: Number(b.version_code),
    versionName: b.version_name,
    packageName: b.package_name,
    appName: b.app_name,
    error: b.error || null,
    size: b.artifact_size != null ? Number(b.artifact_size) : null,
    sha256: b.sha256 || null,
    createdAt: b.created_at,
    startedAt: b.started_at || null,
    finishedAt: b.finished_at || null,
  };
  if (b.status === "success" && b.artifact_key) {
    // Signed, shareable link (works on a phone without logging in) valid for 24h.
    out.downloadUrl = `${ctx.config.publicUrl}/api/builds/${b.id}/download?token=${encodeURIComponent(downloadToken(ctx, b))}`;
  }
  if (b.log !== undefined) out.log = b.log;
  return out;
}

async function loadOwnedBuild(ctx, req) {
  const b = await ctx.db.get("SELECT * FROM builds WHERE id = ?", [req.params.id]);
  if (!b || (b.user_id !== req.user.id && req.user.role !== "admin")) throw notFound("Build not found");
  return b;
}

/** Routes authorised by signed tokens instead of a session (plain links, QR codes). */
function downloadRoutes(ctx) {
  const r = express.Router();

  r.get("/builds/:id/download", h(async (req, res) => {
    const payload = security.verify(ctx.config.secretKey, req.query.token);
    if (!payload || payload.t !== "dl" || payload.b !== req.params.id) throw new HttpError(403, "Download link is invalid or has expired");
    const b = await ctx.db.get("SELECT * FROM builds WHERE id = ?", [req.params.id]);
    if (!b || b.status !== "success" || !b.artifact_key) throw notFound("Build not found");
    const { stream, size } = await ctx.storage.stream(b.artifact_key);
    const fileName = b.artifact_key.split("/").pop();
    res.set("Content-Type", b.format === "aab" ? "application/octet-stream" : "application/vnd.android.package-archive");
    res.set("Content-Disposition", `attachment; filename="${fileName}"`);
    if (size) res.set("Content-Length", String(size));
    stream.pipe(res);
  }));

  r.get("/apps/:id/keystore/file", h(async (req, res) => {
    const payload = security.verify(ctx.config.secretKey, req.query.token);
    if (!payload || payload.t !== "ks" || payload.app !== req.params.id) throw new HttpError(403, "Link is invalid or has expired");
    const app = await ctx.db.get("SELECT package_name FROM apps WHERE id = ?", [req.params.id]);
    if (!app) throw notFound();
    const { stream } = await ctx.storage.stream(`keystores/${req.params.id}.p12`);
    res.set("Content-Type", "application/x-pkcs12");
    res.set("Content-Disposition", `attachment; filename="${app.package_name}-release.p12"`);
    stream.pipe(res);
  }));

  return r;
}

function buildRoutes(ctx) {
  const r = express.Router();
  r.use(authenticate(ctx));

  r.get("/:id", h(async (req, res) => {
    res.json({ build: serializeBuild(ctx, await loadOwnedBuild(ctx, req)) });
  }));

  r.post("/:id/cancel", h(async (req, res) => {
    const b = await loadOwnedBuild(ctx, req);
    if (!["queued", "building"].includes(b.status)) throw new HttpError(409, "Build is not running");
    await ctx.db.run("UPDATE builds SET status = 'canceled', finished_at = ?, error = 'Canceled by user' WHERE id = ? AND status IN ('queued', 'building')",
      [security.now(), b.id]);
    res.json({ ok: true });
  }));

  return r;
}

module.exports = { buildRoutes, downloadRoutes, serializeBuild };
