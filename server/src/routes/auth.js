"use strict";

const express = require("express");
const security = require("../security");
const { bad, HttpError, issueToken, publicUser, authenticate, h } = require("../http");

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// Simple in-memory brute-force protection per IP+email.
const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const entry = attempts.get(key) || { count: 0, reset: now + 15 * 60000 };
  if (now > entry.reset) Object.assign(entry, { count: 0, reset: now + 15 * 60000 });
  entry.count++;
  attempts.set(key, entry);
  if (attempts.size > 10000) attempts.clear();
  return entry.count > 10;
}

module.exports = function authRoutes(ctx) {
  const r = express.Router();

  r.post("/register", h(async (req, res) => {
    const { email, password, name } = req.body || {};
    const userCount = Number((await ctx.db.get("SELECT COUNT(*) AS n FROM users")).n);
    if (!ctx.config.auth.allowSignup && userCount > 0) throw new HttpError(403, "Sign-up is disabled. Ask an administrator for an account.");
    const normalized = String(email || "").trim().toLowerCase();
    if (!EMAIL.test(normalized)) throw bad("Please enter a valid email address");
    if (typeof password !== "string" || password.length < 8) throw bad("Password must be at least 8 characters");
    if (await ctx.db.get("SELECT id FROM users WHERE email = ?", [normalized])) throw new HttpError(409, "An account with this email already exists");
    const user = {
      id: security.id(),
      email: normalized,
      name: String(name || "").trim().slice(0, 80) || normalized.split("@")[0],
      password_hash: security.hashPassword(password),
      role: userCount === 0 ? "admin" : "user", // first account administers the install
      created_at: security.now(),
    };
    await ctx.db.run(
      "INSERT INTO users (id, email, name, password_hash, role, disabled, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
      [user.id, user.email, user.name, user.password_hash, user.role, user.created_at]
    );
    res.status(201).json({ token: issueToken(ctx, user), user: publicUser(user) });
  }));

  r.post("/login", h(async (req, res) => {
    const { email, password } = req.body || {};
    const normalized = String(email || "").trim().toLowerCase();
    if (throttle(`${req.ip}|${normalized}`)) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
    const user = await ctx.db.get("SELECT * FROM users WHERE email = ?", [normalized]);
    if (!user || !security.verifyPassword(password || "", user.password_hash)) throw new HttpError(401, "Wrong email or password");
    if (user.disabled) throw new HttpError(403, "This account has been disabled");
    res.json({ token: issueToken(ctx, user), user: publicUser(user) });
  }));

  r.get("/me", authenticate(ctx), (req, res) => res.json({ user: publicUser(req.user) }));

  r.put("/me", authenticate(ctx), h(async (req, res) => {
    const { name, currentPassword, newPassword } = req.body || {};
    if (name !== undefined) {
      await ctx.db.run("UPDATE users SET name = ? WHERE id = ?", [String(name).trim().slice(0, 80), req.user.id]);
    }
    if (newPassword !== undefined) {
      if (!security.verifyPassword(currentPassword || "", req.user.password_hash)) throw bad("Current password is incorrect");
      if (typeof newPassword !== "string" || newPassword.length < 8) throw bad("New password must be at least 8 characters");
      await ctx.db.run("UPDATE users SET password_hash = ? WHERE id = ?", [security.hashPassword(newPassword), req.user.id]);
    }
    const user = await ctx.db.get("SELECT * FROM users WHERE id = ?", [req.user.id]);
    res.json({ user: publicUser(user) });
  }));

  return r;
};
