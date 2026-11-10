"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../src/validation");

test("package names follow Android/Java rules", () => {
  for (const ok of ["com.example.app", "com.my_shop.app2", "io.a.b.c"]) assert.ok(v.isValidPackageName(ok), ok);
  for (const bad of ["example", "Com.example.app", "com.1example.app", "com.example.", "com..app", "com.new.app", "com.example.class", "com-ex.app", ""]) {
    assert.equal(v.isValidPackageName(bad), false, bad);
  }
});

test("suggested package names are always valid", () => {
  for (const name of ["Bella's Café & Grill", "123 Pizza", "New", "ÜberShop!!", "", "a".repeat(80), "class"]) {
    const pkg = v.suggestPackageName(name);
    assert.ok(v.isValidPackageName(pkg), `${name} -> ${pkg}`);
  }
});

test("validateConfig normalises and rejects bad input", () => {
  const cfg = v.validateConfig({
    appName: "  Shop  ",
    theme: { primary: "#112233" },
    pages: [{ id: "Home Page!", type: "home", title: "Home" }, { id: "home page", type: "about" }],
    leadsEndpoint: "http://evil", appId: "x",
    __proto__: { polluted: true },
  });
  assert.equal(cfg.appName, "Shop");
  assert.equal(cfg.mode, "app");
  assert.equal(cfg.navigation, "bottom");
  assert.equal(cfg.pages[0].id, "homepage");
  assert.notEqual(cfg.pages[1].id, cfg.pages[0].id, "page ids are made unique");
  assert.equal(cfg.leadsEndpoint, undefined);
  assert.equal(cfg.appId, undefined);
  assert.equal({}.polluted, undefined);

  assert.throws(() => v.validateConfig({ pages: [{ type: "nope" }] }), /unknown type/);
  assert.throws(() => v.validateConfig({ theme: { primary: "red" } }), /colour/);
  assert.throws(() => v.validateConfig({ mode: "website", website: { url: "javascript:alert(1)" } }), /http/);
  assert.throws(() => v.validateConfig("x"), /object/);
  assert.throws(() => v.validateConfig({ big: "x".repeat(600 * 1024) }), /too large/);
  assert.throws(() => v.validateConfig({ pages: new Array(41).fill({ type: "text" }) }), /at most 40/);
});

test("version names", () => {
  assert.equal(v.validateVersionName("1.2.3-beta"), "1.2.3-beta");
  assert.throws(() => v.validateVersionName("1 2"));
  assert.throws(() => v.validateVersionName(""));
});
