"use strict";

/*
 * Admin CLI.
 *   node src/cli.js create-admin <email> <password>
 *   node src/cli.js reset-password <email> <password>
 */
const { createServices } = require("./services");
const security = require("./security");

async function main() {
  const [cmd, email, password] = process.argv.slice(2);
  if (!["create-admin", "reset-password"].includes(cmd) || !email || !password) {
    console.log("Usage:\n  node src/cli.js create-admin <email> <password>\n  node src/cli.js reset-password <email> <password>");
    process.exit(1);
  }
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const ctx = await createServices();
  const normalized = email.trim().toLowerCase();
  const existing = await ctx.db.get("SELECT id FROM users WHERE email = ?", [normalized]);
  if (cmd === "create-admin") {
    if (existing) {
      await ctx.db.run("UPDATE users SET role = 'admin', disabled = 0, password_hash = ? WHERE id = ?", [security.hashPassword(password), existing.id]);
      console.log(`Promoted ${normalized} to administrator`);
    } else {
      await ctx.db.run("INSERT INTO users (id, email, name, password_hash, role, disabled, created_at) VALUES (?, ?, ?, ?, 'admin', 0, ?)",
        [security.id(), normalized, "Administrator", security.hashPassword(password), security.now()]);
      console.log(`Created administrator ${normalized}`);
    }
  } else {
    if (!existing) throw new Error("No such user");
    await ctx.db.run("UPDATE users SET password_hash = ? WHERE id = ?", [security.hashPassword(password), existing.id]);
    console.log(`Password reset for ${normalized}`);
  }
  await ctx.db.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
