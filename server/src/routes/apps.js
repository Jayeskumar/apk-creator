"use strict";

const express = require("express");
const security = require("../security");
const { bad, notFound, forbidden, HttpError, authenticate, canBuildProjects, sniffImage, uploader, h } = require("../http");
const starters = require("../starters");
const { validateConfig, isValidPackageName, suggestPackageName, validateVersionName } = require("../validation");
const { keystoreInfo } = require("../builder/keystore");
const { serializeBuild } = require("./builds");

function serializeApp(ctx, row, latestBuild) {
  return {
    id: row.id,
    name: row.name,
    packageName: row.package_name,
    templateId: row.template_id,
    config: JSON.parse(row.config),
    iconUrl: row.icon_key ? `/api/media/${row.icon_key.replace(/^media\//, "")}` : null,
    versionCode: Number(row.version_code),
    versionName: row.version_name,
    hasKeystore: !!row.keystore,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestBuild: latestBuild ? serializeBuild(ctx, latestBuild) : null,
  };
}

async function loadOwnedApp(ctx, req) {
  const row = await ctx.db.get("SELECT * FROM apps WHERE id = ?", [req.params.id]);
  if (!row || (row.user_id !== req.user.id && req.user.role !== "admin")) throw notFound("App not found");
  return row;
}

async function uniquePackageName(ctx, base) {
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    if (!(await ctx.db.get("SELECT id FROM apps WHERE package_name = ?", [candidate]))) return candidate;
    candidate = `${base}${security.id(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`.replace(/\.(\d)/, ".a$1");
  }
  throw new HttpError(409, "Could not find a free package name");
}

module.exports = function appRoutes(ctx) {
  const r = express.Router();
  r.use(authenticate(ctx));

  r.get("/", h(async (req, res) => {
    const rows = req.query.all === "1" && req.user.role === "admin"
      ? await ctx.db.all("SELECT * FROM apps ORDER BY updated_at DESC")
      : await ctx.db.all("SELECT * FROM apps WHERE user_id = ? ORDER BY updated_at DESC", [req.user.id]);
    const out = [];
    for (const row of rows) {
      const latest = await ctx.db.get("SELECT * FROM builds WHERE app_id = ? ORDER BY created_at DESC LIMIT 1", [row.id]);
      const leads = await ctx.db.get("SELECT COUNT(*) AS n FROM leads WHERE app_id = ? AND is_read = 0", [row.id]);
      const app = serializeApp(ctx, row, latest);
      app.unreadLeads = Number(leads.n);
      delete app.config.pages;
      out.push(app);
    }
    res.json({ apps: out });
  }));

  r.post("/", h(async (req, res) => {
    const { templateId, name } = req.body || {};
    const appName = String(name || "").trim().slice(0, 50);
    if (!appName) throw bad("Please give your app a name");
    const max = ctx.config.limits.maxAppsPerUser;
    if (max > 0 && req.user.role !== "admin") {
      const n = Number((await ctx.db.get("SELECT COUNT(*) AS n FROM apps WHERE user_id = ?", [req.user.id])).n);
      if (n >= max) throw new HttpError(403, `Your plan allows up to ${max} apps`);
    }
    // `mode` is a shortcut for the developer templates (used by the MCP server).
    const byMode = { code: "custom-code", project: "android-project", website: "website-to-app" }[req.body.mode];
    const template = await ctx.templates.get(byMode || templateId || "blank");
    if (!template) throw bad("Unknown template");
    if (template.config.mode === "project" && !canBuildProjects(ctx, req.user)) {
      throw forbidden("Native Android project builds are not enabled for your account on this server");
    }

    const config = JSON.parse(JSON.stringify(template.config));
    config.appName = appName;
    if (config.business) config.business.name = appName;
    if (config.mode === "website" && req.body.websiteUrl) config.website = { url: String(req.body.websiteUrl) };
    config.icon = config.icon || {
      symbol: template.icon || "star",
      background: (config.theme && config.theme.primary) || "#1E63E9",
      foreground: "#FFFFFF",
    };
    const validated = validateConfig(config, { maxKb: ctx.config.limits.maxConfigKb });
    const packageName = await uniquePackageName(ctx, suggestPackageName(appName));
    const now = security.now();
    const row = {
      id: security.id(), user_id: req.user.id, name: appName, package_name: packageName, template_id: template.id,
      config: JSON.stringify(validated), version_code: 0, version_name: "1.0.0", created_at: now, updated_at: now,
    };
    await ctx.db.run(
      `INSERT INTO apps (id, user_id, name, package_name, template_id, config, version_code, version_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.user_id, row.name, row.package_name, row.template_id, row.config, row.version_code, row.version_name, row.created_at, row.updated_at]
    );
    // Developer apps start from a small working example.
    if (validated.mode === "code") await ctx.files.write(row.id, starters.toEntries(starters.codeStarter(appName)));
    if (validated.mode === "project") await ctx.files.write(row.id, starters.toEntries(starters.projectStarter(appName, packageName)));
    res.status(201).json({ app: serializeApp(ctx, row) });
  }));

  r.get("/:id", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    const latest = await ctx.db.get("SELECT * FROM builds WHERE app_id = ? ORDER BY created_at DESC LIMIT 1", [row.id]);
    const app = serializeApp(ctx, row, latest);
    app.leadsEndpoint = `${ctx.config.publicUrl}/api/public/leads/${row.id}`;
    res.json({ app });
  }));

  // Short-lived link to run a "code" app in the browser (sandboxed).
  r.get("/:id/preview-url", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    const token = security.sign(ctx.config.secretKey, { t: "pv", app: row.id, exp: Date.now() + 6 * 3600 * 1000 });
    res.json({ url: `/preview/${token}/index.html`, absoluteUrl: `${ctx.config.publicUrl}/preview/${token}/index.html` });
  }));

  r.put("/:id", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    const body = req.body || {};
    const updates = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 50);
      if (!name) throw bad("App name cannot be empty");
      updates.name = name;
    }
    if (body.packageName !== undefined && body.packageName !== row.package_name) {
      if (row.keystore && row.version_code > 0 && !body.confirmPackageChange) {
        throw new HttpError(409, "This app has already been built. Changing the package name creates a different app on devices and Google Play. Confirm to continue.");
      }
      if (!isValidPackageName(body.packageName)) throw bad("Package name must look like com.yourcompany.app (lowercase letters, digits and dots)");
      if (await ctx.db.get("SELECT id FROM apps WHERE package_name = ? AND id <> ?", [body.packageName, row.id])) {
        throw new HttpError(409, "That package name is already used by another app");
      }
      updates.package_name = body.packageName;
    }
    if (body.versionName !== undefined) updates.version_name = validateVersionName(body.versionName);
    if (body.config !== undefined) {
      const cfg = validateConfig(body.config, { maxKb: ctx.config.limits.maxConfigKb });
      if (cfg.mode === "project" && JSON.parse(row.config).mode !== "project" && !canBuildProjects(ctx, req.user)) {
        throw forbidden("Native Android project builds are not enabled for your account on this server");
      }
      if (updates.name) cfg.appName = updates.name;
      updates.config = JSON.stringify(cfg);
    } else if (updates.name) {
      const cfg = JSON.parse(row.config);
      cfg.appName = updates.name;
      updates.config = JSON.stringify(cfg);
    }
    updates.updated_at = security.now();
    const keys = Object.keys(updates);
    await ctx.db.run(`UPDATE apps SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...keys.map((k) => updates[k]), row.id]);
    const fresh = await ctx.db.get("SELECT * FROM apps WHERE id = ?", [row.id]);
    res.json({ app: serializeApp(ctx, fresh) });
  }));

  r.delete("/:id", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    const builds = await ctx.db.all("SELECT artifact_key FROM builds WHERE app_id = ?", [row.id]);
    for (const b of builds) if (b.artifact_key) await ctx.storage.delete(b.artifact_key).catch(() => {});
    await ctx.storage.delete(`keystores/${row.id}.p12`).catch(() => {});
    await ctx.db.run("UPDATE builds SET status = 'canceled' WHERE app_id = ? AND status IN ('queued', 'building')", [row.id]);
    await ctx.db.run("DELETE FROM builds WHERE app_id = ?", [row.id]);
    await ctx.db.run("DELETE FROM leads WHERE app_id = ?", [row.id]);
    await ctx.files.removeAll(row.id);
    await ctx.db.run("DELETE FROM apps WHERE id = ?", [row.id]);
    res.json({ ok: true });
  }));

  r.post("/:id/duplicate", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    const name = `${row.name} (copy)`.slice(0, 50);
    const cfg = JSON.parse(row.config);
    cfg.appName = name;
    const now = security.now();
    const id = security.id();
    const pkg = await uniquePackageName(ctx, suggestPackageName(name));
    await ctx.db.run(
      `INSERT INTO apps (id, user_id, name, package_name, template_id, config, icon_key, version_code, version_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, '1.0.0', ?, ?)`,
      [id, req.user.id, name, pkg, row.template_id, JSON.stringify(cfg), row.icon_key, now, now]
    );
    await ctx.files.copyAll(row.id, id);
    res.status(201).json({ app: serializeApp(ctx, await ctx.db.get("SELECT * FROM apps WHERE id = ?", [id])) });
  }));

  // ------------------------------------------------------------ launcher icon

  r.post("/:id/icon", uploader(ctx), h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    if (!req.file) throw bad("No file uploaded");
    const kind = sniffImage(req.file.buffer);
    if (!kind || kind.ext === "gif") throw bad("Icon must be a PNG, JPEG or WebP image (512×512 recommended)");
    const key = `${security.id(16)}.${kind.ext}`;
    await ctx.storage.put(`media/${key}`, req.file.buffer);
    await ctx.db.run("INSERT INTO media (media_key, user_id, content_type, size, created_at) VALUES (?, ?, ?, ?, ?)",
      [key, req.user.id, kind.type, req.file.size, security.now()]);
    await ctx.db.run("UPDATE apps SET icon_key = ?, updated_at = ? WHERE id = ?", [`media/${key}`, security.now(), row.id]);
    res.json({ iconUrl: `/api/media/${key}` });
  }));

  r.delete("/:id/icon", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    await ctx.db.run("UPDATE apps SET icon_key = NULL, updated_at = ? WHERE id = ?", [security.now(), row.id]);
    res.json({ ok: true });
  }));

  // ------------------------------------------------------------ signing key

  r.get("/:id/keystore", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    const info = await keystoreInfo({ db: ctx.db, config: ctx.config, appId: row.id });
    if (!info) return res.json({ alias: null, message: "No signing key yet — it is created with the first build" });
    res.json({
      alias: info.alias,
      password: info.password,
      createdAt: info.createdAt,
      type: "PKCS12",
      downloadUrl: `/api/apps/${row.id}/keystore/file?token=${encodeURIComponent(security.sign(ctx.config.secretKey, { t: "ks", app: row.id, uid: req.user.id, exp: Date.now() + 10 * 60000 }))}`,
    });
  }));

  // ------------------------------------------------------------ builds

  r.get("/:id/builds", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    const builds = await ctx.db.all(
      "SELECT id, app_id, user_id, status, format, version_code, version_name, package_name, app_name, error, artifact_key, artifact_size, sha256, created_at, started_at, finished_at FROM builds WHERE app_id = ? ORDER BY created_at DESC LIMIT 50",
      [row.id]
    );
    res.json({ builds: builds.map((b) => serializeBuild(ctx, b)) });
  }));

  r.post("/:id/builds", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    const format = (req.body && req.body.format) === "aab" ? "aab" : "apk";
    const active = await ctx.db.get("SELECT id FROM builds WHERE app_id = ? AND status IN ('queued', 'building')", [row.id]);
    if (active) throw new HttpError(409, "A build for this app is already in progress");
    const maxPerDay = ctx.config.limits.maxBuildsPerDay;
    if (maxPerDay > 0 && req.user.role !== "admin") {
      const since = new Date(Date.now() - 86400000).toISOString();
      const n = Number((await ctx.db.get("SELECT COUNT(*) AS n FROM builds WHERE user_id = ? AND created_at > ?", [req.user.id, since])).n);
      if (n >= maxPerDay) throw new HttpError(429, `Daily build limit reached (${maxPerDay} per 24h)`);
    }
    const cfg = validateConfig(JSON.parse(row.config), { maxKb: ctx.config.limits.maxConfigKb });
    if (cfg.mode === "website" && !(cfg.website && cfg.website.url)) throw bad("Enter the website address before building");
    if (cfg.mode === "app" && !cfg.pages.length) throw bad("Add at least one page before building");
    if (cfg.mode === "code" || cfg.mode === "project") {
      const paths = new Set((await ctx.files.list(row.id)).map((f) => f.path));
      if (cfg.mode === "code" && !paths.has("index.html")) throw bad("A web app needs an index.html file at the top level");
      if (cfg.mode === "project") {
        if (!canBuildProjects(ctx, req.user)) throw forbidden("Native Android project builds are not enabled for your account on this server");
        if (!paths.has("settings.gradle") && !paths.has("settings.gradle.kts")) {
          throw bad("A Gradle project needs settings.gradle (or settings.gradle.kts) at the top level");
        }
      }
    }

    const versionCode = Number(row.version_code) + 1;
    await ctx.db.run("UPDATE apps SET version_code = ? WHERE id = ?", [versionCode, row.id]);
    const build = {
      id: security.id(), app_id: row.id, user_id: req.user.id, status: "queued", format, version_code: versionCode,
      version_name: row.version_name, package_name: row.package_name, app_name: row.name, icon_key: row.icon_key,
      config: JSON.stringify(cfg), created_at: security.now(),
    };
    await ctx.db.run(
      `INSERT INTO builds (id, app_id, user_id, status, format, version_code, version_name, package_name, app_name, icon_key, config, log, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)`,
      [build.id, build.app_id, build.user_id, build.status, build.format, build.version_code, build.version_name, build.package_name, build.app_name, build.icon_key, build.config, build.created_at]
    );
    if (ctx.worker) ctx.worker.schedule(10);
    res.status(202).json({ build: serializeBuild(ctx, build) });
  }));

  // ------------------------------------------------------------ leads

  r.get("/:id/leads", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    const leads = await ctx.db.all("SELECT * FROM leads WHERE app_id = ? ORDER BY created_at DESC LIMIT 500", [row.id]);
    res.json({ leads: leads.map((l) => ({ id: l.id, kind: l.kind, data: JSON.parse(l.data), read: !!l.is_read, createdAt: l.created_at })) });
  }));

  r.post("/:id/leads/read", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    await ctx.db.run("UPDATE leads SET is_read = 1 WHERE app_id = ?", [row.id]);
    res.json({ ok: true });
  }));

  r.delete("/:id/leads/:leadId", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    await ctx.db.run("DELETE FROM leads WHERE id = ? AND app_id = ?", [req.params.leadId, row.id]);
    res.json({ ok: true });
  }));

  r.get("/:id/leads.csv", h(async (req, res) => {
    const row = await loadOwnedApp(ctx, req);
    const leads = await ctx.db.all("SELECT * FROM leads WHERE app_id = ? ORDER BY created_at DESC", [row.id]);
    const parsed = leads.map((l) => ({ ...l, data: JSON.parse(l.data) }));
    const fields = [...new Set(parsed.flatMap((l) => Object.keys(l.data).filter((k) => typeof l.data[k] !== "object")))];
    const cell = (v) => {
      let s = String(v == null ? "" : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection guard
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [["date", "kind", ...fields].map(cell).join(",")];
    for (const l of parsed) lines.push([l.created_at, l.kind, ...fields.map((f) => l.data[f])].map(cell).join(","));
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="leads-${row.package_name}.csv"`);
    res.send(lines.join("\n"));
  }));

  return r;
};

module.exports.serializeApp = serializeApp;
module.exports.loadOwnedApp = loadOwnedApp;
