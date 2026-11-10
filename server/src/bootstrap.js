"use strict";

const security = require("./security");

/** Creates the initial administrator from ADMIN_EMAIL / ADMIN_PASSWORD if provided. */
async function ensureAdmin(ctx) {
  const { adminEmail, adminPassword } = ctx.config.auth;
  if (!adminEmail || !adminPassword) return;
  const email = adminEmail.trim().toLowerCase();
  const existing = await ctx.db.get("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) return;
  await ctx.db.run(
    "INSERT INTO users (id, email, name, password_hash, role, disabled, created_at) VALUES (?, ?, ?, ?, 'admin', 0, ?)",
    [security.id(), email, "Administrator", security.hashPassword(adminPassword), security.now()]
  );
  console.log(`[bootstrap] created administrator ${email}`);
}

module.exports = { ensureAdmin };
