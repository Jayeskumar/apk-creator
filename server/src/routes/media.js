"use strict";

const express = require("express");
const security = require("../security");
const { bad, notFound, authenticate, sniffImage, uploader, h } = require("../http");

const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

module.exports = function mediaRoutes(ctx) {
  const r = express.Router();

  r.post("/", authenticate(ctx), uploader(ctx), h(async (req, res) => {
    if (!req.file) throw bad("No file uploaded");
    const kind = sniffImage(req.file.buffer);
    if (!kind) throw bad("Only PNG, JPEG, WebP and GIF images are supported");
    const key = `${security.id(16)}.${kind.ext}`;
    await ctx.storage.put(`media/${key}`, req.file.buffer);
    await ctx.db.run("INSERT INTO media (media_key, user_id, content_type, size, created_at) VALUES (?, ?, ?, ?, ?)",
      [key, req.user.id, kind.type, req.file.size, security.now()]);
    res.status(201).json({ key, url: `/api/media/${key}` });
  }));

  // Public (keys are unguessable) so the sandboxed preview iframe can load them.
  r.get("/:key", h(async (req, res) => {
    const m = /^[A-Za-z0-9_-]{8,64}\.(png|jpg|webp|gif)$/.exec(req.params.key);
    if (!m) throw notFound();
    let obj;
    try {
      obj = await ctx.storage.stream(`media/${req.params.key}`);
    } catch {
      throw notFound();
    }
    res.set("Content-Type", TYPES[m[1]]);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("X-Content-Type-Options", "nosniff");
    if (obj.size) res.set("Content-Length", String(obj.size));
    obj.stream.pipe(res);
  }));

  return r;
};
