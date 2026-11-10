"use strict";

const express = require("express");
const security = require("../security");
const { bad, notFound, authenticate, requireAdmin, publicUser, h } = require("../http");
const { validateConfig } = require("../validation");
const { serializeBuild } = require("./builds");

module.exports = function adminRoutes(ctx) {
  const r = express.Router();
  r.use(authenticate(ctx), requireAdmin);

  r.get("/stats", h(async (req, res) => {
    const count = async (sql, p = []) => Number((await ctx.db.get(sql, p)).n);
    const since = new Date(Date.now() - 86400000).toISOString();
    res.json({
      users: await count("SELECT COUNT(*) AS n FROM users"),
      apps: await count("SELECT COUNT(*) AS n FROM apps"),
      builds: await count("SELECT COUNT(*) AS n FROM builds"),
      buildsToday: await count("SELECT COUNT(*) AS n FROM builds WHERE created_at > ?", [since]),
      queued: await count("SELECT COUNT(*) AS n FROM builds WHERE status = 'queued'"),
      building: await count("SELECT COUNT(*) AS n FROM builds WHERE status = 'building'"),
      failedToday: await count("SELECT COUNT(*) AS n FROM builds WHERE status = 'failed' AND created_at > ?", [since]),
      leads: await count("SELECT COUNT(*) AS n FROM leads"),
      system: {
        mode: ctx.config.mode,
        database: ctx.db.driver,
        storage: ctx.storage.driver,
        embeddedWorker: !!ctx.worker,
        publicUrl: ctx.config.publicUrl,
        allowSignup: ctx.config.auth.allowSignup,
        node: process.version,
      },
    });
  }));

  r.get("/users", h(async (req, res) => {
    const users = await ctx.db.all("SELECT * FROM users ORDER BY created_at DESC LIMIT 1000");
    const out = [];
    for (const u of users) {
      const apps = Number((await ctx.db.get("SELECT COUNT(*) AS n FROM apps WHERE user_id = ?", [u.id])).n);
      out.push({ ...publicUser(u), apps });
    }
    res.json({ users: out });
  }));

  r.post("/users", h(async (req, res) => {
    const { email, password, name, role } = req.body || {};
    const normalized = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw bad("Invalid email");
    if (typeof password !== "string" || password.length < 8) throw bad("Password must be at least 8 characters");
    if (await ctx.db.get("SELECT id FROM users WHERE email = ?", [normalized])) throw bad("Email already registered");
    const id = security.id();
    await ctx.db.run("INSERT INTO users (id, email, name, password_hash, role, disabled, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
      [id, normalized, String(name || normalized.split("@")[0]).slice(0, 80), security.hashPassword(password), role === "admin" ? "admin" : "user", security.now()]);
    res.status(201).json({ user: publicUser(await ctx.db.get("SELECT * FROM users WHERE id = ?", [id])) });
  }));

  r.patch("/users/:id", h(async (req, res) => {
    const u = await ctx.db.get("SELECT * FROM users WHERE id = ?", [req.params.id]);
    if (!u) throw notFound("User not found");
    if (u.id === req.user.id && (req.body.role === "user" || req.body.disabled)) throw bad("You cannot demote or disable yourself");
    if (req.body.role !== undefined) await ctx.db.run("UPDATE users SET role = ? WHERE id = ?", [req.body.role === "admin" ? "admin" : "user", u.id]);
    if (req.body.disabled !== undefined) await ctx.db.run("UPDATE users SET disabled = ? WHERE id = ?", [req.body.disabled ? 1 : 0, u.id]);
    if (req.body.password) {
      if (String(req.body.password).length < 8) throw bad("Password must be at least 8 characters");
      await ctx.db.run("UPDATE users SET password_hash = ? WHERE id = ?", [security.hashPassword(req.body.password), u.id]);
    }
    res.json({ user: publicUser(await ctx.db.get("SELECT * FROM users WHERE id = ?", [u.id])) });
  }));

  r.get("/builds", h(async (req, res) => {
    const rows = await ctx.db.all(
      `SELECT b.id, b.app_id, b.user_id, b.status, b.format, b.version_code, b.version_name, b.package_name, b.app_name, b.error,
              b.artifact_key, b.artifact_size, b.sha256, b.created_at, b.started_at, b.finished_at, b.worker_id, u.email
       FROM builds b LEFT JOIN users u ON u.id = b.user_id ORDER BY b.created_at DESC LIMIT 200`
    );
    res.json({ builds: rows.map((b) => ({ ...serializeBuild(ctx, b), owner: b.email, worker: b.worker_id })) });
  }));

  // Save an existing app as a reusable template for everyone on this install.
  r.post("/templates", h(async (req, res) => {
    const { appId, name, category, description } = req.body || {};
    const app = await ctx.db.get("SELECT * FROM apps WHERE id = ?", [appId]);
    if (!app) throw notFound("App not found");
    if (!String(name || "").trim()) throw bad("Template name is required");
    const config = validateConfig(JSON.parse(app.config));
    const id = "custom-" + security.id(6).toLowerCase();
    await ctx.db.run(
      "INSERT INTO custom_templates (id, name, category, description, icon, config, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, String(name).trim().slice(0, 60), String(category || "Custom").slice(0, 40), String(description || "").slice(0, 300),
        (config.icon && config.icon.symbol) || "star", JSON.stringify(config), req.user.id, security.now()]
    );
    res.status(201).json({ id });
  }));

  r.delete("/templates/:id", h(async (req, res) => {
    await ctx.db.run("DELETE FROM custom_templates WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  }));

  return r;
};
