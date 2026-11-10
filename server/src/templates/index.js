"use strict";

const fs = require("node:fs");
const path = require("node:path");
const builtin = require("./builtin");

/*
 * Template registry = built-in templates + JSON files in TEMPLATES_DIR
 * (handy for on-premise installs that ship their own industry packs)
 * + templates saved from apps by administrators (database).
 */
class TemplateRegistry {
  constructor({ db, extraDir }) {
    this.db = db;
    this.extraDir = extraDir;
    this.fileTemplates = this.loadDir(extraDir);
  }

  loadDir(dir) {
    const out = [];
    if (!dir || !fs.existsSync(dir)) return out;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        if (t && t.id && t.name && t.config) out.push({ category: "Custom", icon: "star", description: "", tags: [], ...t, builtin: false, source: "file" });
      } catch (e) {
        console.warn(`[templates] skipping ${f}: ${e.message}`);
      }
    }
    return out;
  }

  async list() {
    const rows = await this.db.all("SELECT * FROM custom_templates ORDER BY created_at DESC");
    const custom = rows.map((r) => ({
      id: r.id, name: r.name, category: r.category, description: r.description, icon: r.icon,
      tags: [], builtin: false, source: "custom", config: JSON.parse(r.config),
    }));
    return [...builtin, ...this.fileTemplates, ...custom];
  }

  async summaries() {
    return (await this.list()).map(({ config, ...meta }) => ({
      ...meta,
      mode: config.mode || "app",
      primary: config.theme && config.theme.primary,
      secondary: config.theme && config.theme.secondary,
      pageCount: (config.pages || []).length,
      pages: (config.pages || []).map((p) => ({ title: p.title, icon: p.icon, type: p.type })),
    }));
  }

  async get(id) {
    return (await this.list()).find((t) => t.id === id) || null;
  }
}

module.exports = { TemplateRegistry };
