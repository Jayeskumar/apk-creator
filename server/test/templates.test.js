"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const templates = require("../src/templates/builtin");
const { validateConfig, PAGE_TYPES } = require("../src/validation");
const ICONS = require(path.join(__dirname, "..", "..", "runtime", "icons.js"));

const ACTIONS = new Set(["call", "whatsapp", "email", "map", "website"]);

test("there are many business templates across categories", () => {
  assert.ok(templates.length >= 25, `only ${templates.length} templates`);
  assert.ok(new Set(templates.map((t) => t.category)).size >= 10);
  assert.equal(new Set(templates.map((t) => t.id)).size, templates.length, "template ids are unique");
});

for (const t of templates) {
  test(`template ${t.id} is valid`, () => {
    assert.ok(t.name && t.description && t.category);
    assert.ok(ICONS[t.icon], `unknown template icon ${t.icon}`);
    const cfg = validateConfig(t.config);
    assert.deepEqual(cfg.pages.map((p) => p.id), t.config.pages.map((p) => p.id), "page ids survive validation unchanged");
    const ids = new Set(cfg.pages.map((p) => p.id));
    for (const p of cfg.pages) {
      assert.ok(PAGE_TYPES.has(p.type), `${p.id}: type ${p.type}`);
      assert.ok(ICONS[p.icon], `${p.id}: unknown icon ${p.icon}`);
      if (p.ctaAction) assert.ok(ACTIONS.has(p.ctaAction) || ids.has(p.ctaAction), `${p.id}: CTA target ${p.ctaAction} missing`);
      for (const h of p.highlights || []) assert.ok(ICONS[h.icon], `${p.id}: highlight icon ${h.icon}`);
      for (const l of (p.type === "links" ? p.items : []) || []) assert.ok(ICONS[l.icon], `${p.id}: link icon ${l.icon}`);
    }
    if (cfg.mode === "app") assert.ok(cfg.pages.length >= 3, "app templates have several pages");
    else assert.match(cfg.website.url, /^https:\/\//);
  });
}
