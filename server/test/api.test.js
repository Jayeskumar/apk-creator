"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, PNG } = require("./helpers");

test("API end-to-end (no worker)", async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  let admin, alice, bob, appId, buildId;

  await t.test("first account becomes admin, later ones are users", async () => {
    admin = await s.register("Admin@Example.com", "password123", "Admin");
    alice = await s.register("alice@example.com");
    bob = await s.register("bob@example.com");
    const me = await s.call("GET", "/api/auth/me", { token: admin });
    assert.equal(me.body.user.role, "admin");
    assert.equal(me.body.user.email, "admin@example.com");
    assert.equal((await s.call("GET", "/api/auth/me", { token: alice })).body.user.role, "user");
  });

  await t.test("auth errors", async () => {
    assert.equal((await s.call("POST", "/api/auth/register", { body: { email: "alice@example.com", password: "password123" } })).status, 409);
    assert.equal((await s.call("POST", "/api/auth/register", { body: { email: "x@y.co", password: "short" } })).status, 400);
    assert.equal((await s.call("POST", "/api/auth/login", { body: { email: "alice@example.com", password: "wrong-pass" } })).status, 401);
    assert.equal((await s.call("GET", "/api/apps")).status, 401);
    assert.equal((await s.call("GET", "/api/apps", { token: "forged.token" })).status, 401);
    const ok = await s.call("POST", "/api/auth/login", { body: { email: "ALICE@example.com", password: "password123" } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
  });

  await t.test("templates are listed and fetchable", async () => {
    const list = await s.call("GET", "/api/templates");
    assert.ok(list.body.templates.length >= 25);
    assert.equal(list.body.templates[0].config, undefined, "summaries omit full config");
    const one = await s.call("GET", "/api/templates/restaurant");
    assert.equal(one.body.template.config.pages[0].type, "home");
    assert.equal((await s.call("GET", "/api/templates/nope")).status, 404);
  });

  await t.test("create app from template", async () => {
    const r = await s.call("POST", "/api/apps", { token: alice, body: { templateId: "restaurant", name: "Rosa's Pizzeria" } });
    assert.equal(r.status, 201);
    appId = r.body.app.id;
    assert.equal(r.body.app.packageName, "com.rosaspizzeria.app");
    assert.equal(r.body.app.config.appName, "Rosa's Pizzeria");
    assert.equal(r.body.app.config.business.name, "Rosa's Pizzeria");
    assert.equal(r.body.app.config.icon.symbol, "restaurant");
    // Same name again gets a unique package name
    const r2 = await s.call("POST", "/api/apps", { token: bob, body: { templateId: "restaurant", name: "Rosa's Pizzeria" } });
    assert.notEqual(r2.body.app.packageName, "com.rosaspizzeria.app");
    assert.match(r2.body.app.packageName, /^com\.rosaspizzeria\.app[a-z0-9]+$/);
    assert.equal((await s.call("POST", "/api/apps", { token: alice, body: { templateId: "restaurant", name: " " } })).status, 400);
    const web = await s.call("POST", "/api/apps", { token: alice, body: { templateId: "website-to-app", name: "My Site", websiteUrl: "https://example.org" } });
    assert.equal(web.body.app.config.mode, "website");
    assert.equal(web.body.app.config.website.url, "https://example.org");
  });

  await t.test("users cannot see each other's apps", async () => {
    assert.equal((await s.call("GET", `/api/apps/${appId}`, { token: bob })).status, 404);
    assert.equal((await s.call("PUT", `/api/apps/${appId}`, { token: bob, body: { name: "hacked" } })).status, 404);
    assert.equal((await s.call("DELETE", `/api/apps/${appId}`, { token: bob })).status, 404);
    assert.equal((await s.call("GET", `/api/apps/${appId}`, { token: admin })).status, 200, "admins can see everything");
    const bobs = await s.call("GET", "/api/apps", { token: bob });
    assert.equal(bobs.body.apps.length, 1);
  });

  await t.test("update config, name, package and version", async () => {
    const { body } = await s.call("GET", `/api/apps/${appId}`, { token: alice });
    const cfg = body.app.config;
    cfg.theme.primary = "#123456";
    cfg.pages.push({ type: "faq", title: "Questions", items: [{ question: "Q?", answer: "A." }] });
    const r = await s.call("PUT", `/api/apps/${appId}`, { token: alice, body: { config: cfg, name: "Rosa Pizza", packageName: "com.rosa.pizza", versionName: "1.1.0" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.app.name, "Rosa Pizza");
    assert.equal(r.body.app.config.appName, "Rosa Pizza");
    assert.equal(r.body.app.packageName, "com.rosa.pizza");
    assert.equal(r.body.app.versionName, "1.1.0");
    assert.equal(r.body.app.config.theme.primary, "#123456");
    assert.ok(r.body.app.config.pages.at(-1).id, "new page received an id");

    assert.equal((await s.call("PUT", `/api/apps/${appId}`, { token: alice, body: { packageName: "Bad Name" } })).status, 400);
    assert.equal((await s.call("PUT", `/api/apps/${appId}`, { token: alice, body: { config: { theme: { primary: "blue" } } } })).status, 400);
    assert.equal((await s.call("PUT", `/api/apps/${appId}`, { token: alice, body: { versionName: "x y" } })).status, 400);
  });

  await t.test("media upload sniffs real image types", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([PNG], { type: "image/png" }), "a.png");
    const up = await s.call("POST", "/api/media", { token: alice, body: fd });
    assert.equal(up.status, 201);
    assert.match(up.body.url, /^\/api\/media\/[\w-]+\.png$/);
    const img = await s.call("GET", up.body.url, { raw: true });
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");

    const evil = new FormData();
    evil.append("file", new Blob(["<script>alert(1)</script>"], { type: "image/png" }), "x.png");
    assert.equal((await s.call("POST", "/api/media", { token: alice, body: evil })).status, 400);
    assert.equal((await s.call("GET", "/api/media/..%2F..%2Fsecret.key")).status, 404);

    const icon = new FormData();
    icon.append("file", new Blob([PNG], { type: "image/png" }), "icon.png");
    const ic = await s.call("POST", `/api/apps/${appId}/icon`, { token: alice, body: icon });
    assert.equal(ic.status, 200);
    assert.match(ic.body.iconUrl, /^\/api\/media\//);
  });

  await t.test("public lead capture with CORS and text/plain bodies", async () => {
    const pre = await s.call("OPTIONS", `/api/public/leads/${appId}`, { raw: true });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), "*");
    const r = await s.call("POST", `/api/public/leads/${appId}`, {
      body: JSON.stringify({ kind: "order", data: { name: "Sam", phone: "=cmd()", items: [{ name: "Pizza", qty: 2, price: 12 }], total: 24, "bad key": 1 } }),
      headers: { "content-type": "text/plain;charset=UTF-8" },
    });
    assert.equal(r.status, 201);
    assert.equal((await s.call("POST", "/api/public/leads/missing", { body: { data: { a: "b" } } })).status, 404);
    assert.equal((await s.call("POST", `/api/public/leads/${appId}`, { body: { data: {} } })).status, 400);

    const leads = await s.call("GET", `/api/apps/${appId}/leads`, { token: alice });
    assert.equal(leads.body.leads.length, 1);
    assert.equal(leads.body.leads[0].kind, "order");
    assert.equal(leads.body.leads[0].data.items[0].qty, 2);
    assert.equal(leads.body.leads[0].data["bad key"], undefined);
    assert.equal((await s.call("GET", `/api/apps/${appId}/leads`, { token: bob })).status, 404);

    const list = await s.call("GET", "/api/apps", { token: alice });
    assert.equal(list.body.apps.find((a) => a.id === appId).unreadLeads, 1);

    const csv = await s.call("GET", `/api/apps/${appId}/leads.csv`, { token: alice, raw: true });
    const text = await csv.text();
    assert.match(text, /"date","kind","name","phone","total"/);
    assert.match(text, /"'=cmd\(\)"/, "formula injection is neutralised");
  });

  await t.test("build queue: enqueue, conflict, cancel, history", async () => {
    const r = await s.call("POST", `/api/apps/${appId}/builds`, { token: alice, body: { format: "aab" } });
    assert.equal(r.status, 202);
    buildId = r.body.build.id;
    assert.equal(r.body.build.status, "queued");
    assert.equal(r.body.build.format, "aab");
    assert.equal(r.body.build.versionCode, 1);
    assert.equal(r.body.build.packageName, "com.rosa.pizza");
    assert.equal((await s.call("POST", `/api/apps/${appId}/builds`, { token: alice })).status, 409, "one active build per app");
    assert.equal((await s.call("GET", `/api/builds/${buildId}`, { token: bob })).status, 404);
    assert.equal((await s.call("POST", `/api/builds/${buildId}/cancel`, { token: alice })).status, 200);
    const b = await s.call("GET", `/api/builds/${buildId}`, { token: alice });
    assert.equal(b.body.build.status, "canceled");
    const again = await s.call("POST", `/api/apps/${appId}/builds`, { token: alice });
    assert.equal(again.body.build.versionCode, 2, "version code increases every build");
    const hist = await s.call("GET", `/api/apps/${appId}/builds`, { token: alice });
    assert.equal(hist.body.builds.length, 2);
  });

  await t.test("claimNextBuild is atomic and FIFO", async () => {
    const first = await s.ctx.db.claimNextBuild("w1", new Date().toISOString());
    assert.ok(first);
    assert.equal(first.status, "building");
    assert.equal(await s.ctx.db.claimNextBuild("w2", new Date().toISOString()), null);
  });

  await t.test("download links require a valid signed token", async () => {
    assert.equal((await s.call("GET", `/api/builds/${buildId}/download`)).status, 403);
    assert.equal((await s.call("GET", `/api/builds/${buildId}/download?token=abc.def`)).status, 403);
    assert.equal((await s.call("GET", `/api/apps/${appId}/keystore/file?token=abc.def`)).status, 403);
    const ks = await s.call("GET", `/api/apps/${appId}/keystore`, { token: alice });
    assert.equal(ks.body.alias, null, "no key before the first successful build");
  });

  await t.test("admin endpoints are protected", async () => {
    assert.equal((await s.call("GET", "/api/admin/stats", { token: alice })).status, 403);
    const stats = await s.call("GET", "/api/admin/stats", { token: admin });
    assert.equal(stats.status, 200);
    assert.equal(stats.body.users, 3);
    assert.equal(stats.body.system.database, process.env.TEST_DATABASE_URL ? "postgres" : "sqlite");
    const users = await s.call("GET", "/api/admin/users", { token: admin });
    const bobUser = users.body.users.find((u) => u.email === "bob@example.com");
    await s.call("PATCH", `/api/admin/users/${bobUser.id}`, { token: admin, body: { disabled: true } });
    assert.equal((await s.call("GET", "/api/apps", { token: bob })).status, 401, "disabled users are locked out");
    const self = users.body.users.find((u) => u.email === "admin@example.com");
    assert.equal((await s.call("PATCH", `/api/admin/users/${self.id}`, { token: admin, body: { role: "user" } })).status, 400);
  });

  await t.test("admins can save an app as a custom template", async () => {
    const r = await s.call("POST", "/api/admin/templates", { token: admin, body: { appId, name: "Pizza Chain", category: "Franchise" } });
    assert.equal(r.status, 201);
    const list = await s.call("GET", "/api/templates");
    const tpl = list.body.templates.find((t) => t.id === r.body.id);
    assert.equal(tpl.name, "Pizza Chain");
    const created = await s.call("POST", "/api/apps", { token: alice, body: { templateId: r.body.id, name: "Branch 2" } });
    assert.equal(created.status, 201);
    assert.equal(created.body.app.config.theme.primary, "#123456");
  });

  await t.test("duplicate and delete", async () => {
    const dup = await s.call("POST", `/api/apps/${appId}/duplicate`, { token: alice });
    assert.equal(dup.status, 201);
    assert.equal(dup.body.app.name, "Rosa Pizza (copy)");
    assert.notEqual(dup.body.app.packageName, "com.rosa.pizza");
    assert.equal((await s.call("DELETE", `/api/apps/${dup.body.app.id}`, { token: alice })).status, 200);
    assert.equal((await s.call("GET", `/api/apps/${dup.body.app.id}`, { token: alice })).status, 404);
  });

  await t.test("static UI and runtime are served", async () => {
    const html = await s.call("GET", "/", { raw: true });
    assert.match(await html.text(), /<div id="root">/);
    const rt = await s.call("GET", "/runtime/app.js", { raw: true });
    assert.equal(rt.status, 200);
    assert.equal((await s.call("GET", "/api/nope")).status, 404);
    assert.equal((await s.call("GET", "/api/health")).body.ok, true);
  });
});

test("sign-up can be disabled (after the first admin)", async (t) => {
  const s = await startServer({ ALLOW_SIGNUP: "false" });
  t.after(() => s.close());
  await s.register("first@example.com");
  const r = await s.call("POST", "/api/auth/register", { body: { email: "second@example.com", password: "password123" } });
  assert.equal(r.status, 403);
});

test("per-user app limits apply in cloud mode", async (t) => {
  const s = await startServer({ DEPLOYMENT_MODE: "cloud", MAX_APPS_PER_USER: "1", SECRET_KEY: "test-secret" });
  t.after(() => s.close());
  await s.register("owner@example.com");
  const user = await s.register("user@example.com");
  assert.equal((await s.call("POST", "/api/apps", { token: user, body: { name: "One" } })).status, 201);
  assert.equal((await s.call("POST", "/api/apps", { token: user, body: { name: "Two" } })).status, 403);
});
