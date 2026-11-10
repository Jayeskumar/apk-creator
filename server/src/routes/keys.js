"use strict";

/*
 * Personal API keys. They authenticate MCP clients (Claude Code, Claude
 * Desktop, …) and scripts as the user who created them. The key is shown
 * once; only its SHA-256 hash is stored.
 */
const express = require("express");
const crypto = require("node:crypto");
const security = require("../security");
const { bad, HttpError, authenticate, requireSession, h, API_KEY_PREFIX, hashApiKey } = require("../http");

module.exports = function keyRoutes(ctx) {
  const r = express.Router();
  r.use(authenticate(ctx), requireSession);

  r.get("/", h(async (req, res) => {
    const rows = await ctx.db.all("SELECT id, name, key_prefix, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    res.json({ keys: rows.map((k) => ({ id: k.id, name: k.name, prefix: k.key_prefix, createdAt: k.created_at, lastUsedAt: k.last_used_at || null })) });
  }));

  r.post("/", h(async (req, res) => {
    const name = String((req.body && req.body.name) || "").trim().slice(0, 60);
    if (!name) throw bad("Give the key a name, e.g. “Claude Code on my laptop”");
    const count = Number((await ctx.db.get("SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ?", [req.user.id])).n);
    if (count >= 20) throw new HttpError(409, "You can have at most 20 API keys. Revoke one first.");
    const key = API_KEY_PREFIX + crypto.randomBytes(30).toString("base64url");
    const row = { id: security.id(), prefix: key.slice(0, 12), createdAt: security.now() };
    await ctx.db.run("INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [row.id, req.user.id, name, hashApiKey(key), row.prefix, row.createdAt]);
    // The only time the full key is ever returned.
    res.status(201).json({ key, id: row.id, name, prefix: row.prefix, createdAt: row.createdAt });
  }));

  r.delete("/:id", h(async (req, res) => {
    await ctx.db.run("DELETE FROM api_keys WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    res.json({ ok: true });
  }));

  return r;
};
