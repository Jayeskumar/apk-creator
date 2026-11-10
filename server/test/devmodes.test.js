"use strict";

/* API keys, source files (code / project apps), ZIP import, preview sandbox and the MCP server. */
const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { startServer } = require("./helpers");
const { readZip } = require("../src/zip");
const { normalizePath, isIgnored } = require("../src/files");
const { mergePatch, extractErrors } = require("../src/mcp/tools");

/** Builds a small ZIP archive in memory (deflate), enough to exercise the importer. */
function makeZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(content);
    const comp = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, comp);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(entries).length, 8); eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

test("file paths are validated and junk is ignored", () => {
  assert.equal(normalizePath("./js\\app.js"), "js/app.js");
  assert.equal(normalizePath("/index.html"), "index.html");
  for (const bad of ["", "../x", "a/../b", "a//b", "my file.js", "a/./b", "x".repeat(300), "é.js", "a\0b"]) {
    assert.throws(() => normalizePath(bad), /path/i, JSON.stringify(bad));
  }
  assert.ok(isIgnored("app/build/outputs/a.txt"));
  assert.ok(isIgnored(".git/config"));
  assert.ok(isIgnored("release.jks"));
  assert.ok(isIgnored("local.properties"));
  assert.ok(!isIgnored("app/build.gradle"));
});

test("zip reader enforces limits and rejects garbage", () => {
  const zip = makeZip({ "a.txt": "hello", "dir/b.txt": "x".repeat(5000) });
  assert.deepEqual(readZip(zip).map((e) => [e.path, e.data.length]), [["a.txt", 5], ["dir/b.txt", 5000]]);
  assert.throws(() => readZip(zip, { maxEntryBytes: 100 }), /too large/);
  assert.throws(() => readZip(zip, { maxTotalBytes: 1000 }), /too large/);
  assert.throws(() => readZip(zip, { maxEntries: 1 }), /too many/);
  assert.throws(() => readZip(Buffer.from("definitely not a zip file at all")), /Not a ZIP/);
});

test("merge patch and build error extraction", () => {
  assert.deepEqual(mergePatch({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { b: 9, c: null }, list: [3], n: "x" }), { a: { b: 9 }, list: [3], n: "x" });
  assert.equal({}.polluted, undefined);
  mergePatch({}, JSON.parse('{"__proto__":{"polluted":true}}'));
  assert.equal({}.polluted, undefined);
  const errors = extractErrors([
    "> Task :app:compileReleaseJavaWithJavac FAILED",
    "app/src/main/java/a/Main.java:29: error: cannot find symbol",
    "        button.setText(nope);",
    "FAILURE: Build failed with an exception.",
    "* What went wrong:",
    "Execution failed for task ':app:compileReleaseJavaWithJavac'.",
    "> Compilation failed; see the compiler output below.",
    "* Try:",
    "> Run with --info",
  ].join("\n"));
  assert.ok(errors.includes("app/src/main/java/a/Main.java:29: error: cannot find symbol"));
  assert.ok(errors.includes("        button.setText(nope);"), "includes the offending source line");
  assert.ok(errors.some((l) => l.startsWith("Execution failed for task")));
  assert.ok(!errors.some((l) => l.includes("--info")));
});

test("developer apps, API keys and MCP", async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  const admin = await s.register("admin@example.com");
  const user = await s.register("user@example.com");
  let key, codeId;

  const rpc = async (method, params, token = key) => {
    const r = await s.call("POST", "/mcp", { token, body: { jsonrpc: "2.0", id: 7, method, params } });
    return r;
  };
  const tool = async (name, args, token = key) => (await rpc("tools/call", { name, arguments: args }, token)).body.result;

  await t.test("API keys: create, list, authenticate, revoke", async () => {
    const created = await s.call("POST", "/api/keys", { token: user, body: { name: "Claude Code" } });
    assert.equal(created.status, 201);
    key = created.body.key;
    assert.match(key, /^apkc_[\w-]{40}$/);
    const list = await s.call("GET", "/api/keys", { token: user });
    assert.equal(list.body.keys.length, 1);
    assert.equal(list.body.keys[0].key, undefined, "the secret is never listed");
    assert.equal(JSON.stringify(await s.ctx.db.all("SELECT * FROM api_keys")).includes(key), false, "only a hash is stored");
    assert.equal((await s.call("GET", "/api/apps", { token: key })).status, 200, "keys work on the REST API");
    assert.equal((await s.call("GET", "/api/apps", { token: "apkc_" + "x".repeat(40) })).status, 401);
    assert.equal((await s.call("POST", "/api/keys", { token: key, body: { name: "self-replicating" } })).status, 403, "a key cannot mint keys");
    assert.equal((await s.call("POST", "/api/keys", { token: user, body: { name: "" } })).status, 400);
    const other = (await s.call("POST", "/api/keys", { token: user, body: { name: "temp" } })).body;
    await s.call("DELETE", `/api/keys/${other.id}`, { token: user });
    assert.equal((await s.call("GET", "/api/apps", { token: other.key })).status, 401, "revoked keys stop working");
  });

  await t.test("MCP handshake and discovery", async () => {
    const unauth = await s.call("POST", "/mcp", { body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, raw: true });
    assert.equal(unauth.status, 401);
    assert.match(unauth.headers.get("www-authenticate"), /^Bearer/);
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    assert.equal(init.body.result.protocolVersion, "2025-06-18");
    assert.equal(init.body.result.serverInfo.name, "apk-creator");
    assert.ok(init.body.result.capabilities.tools);
    assert.match(init.body.result.instructions, /build_app/);
    assert.equal((await rpc("initialize", { protocolVersion: "1999-01-01" })).body.result.protocolVersion, "2025-11-25", "unknown versions fall back to the latest");
    const note = await s.call("POST", "/mcp", { token: key, body: { jsonrpc: "2.0", method: "notifications/initialized" }, raw: true });
    assert.equal(note.status, 202);
    assert.deepEqual((await rpc("ping")).body.result, {});
    assert.equal((await rpc("resources/list")).body.error.code, -32601);
    assert.equal((await s.call("GET", "/mcp", { token: key })).status, 405);
    const batch = await s.call("POST", "/mcp", { token: key, body: [{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/x" }, { jsonrpc: "2.0", id: 2, method: "ping" }] });
    assert.equal(batch.body.length, 2);

    const tools = (await rpc("tools/list")).body.result.tools;
    assert.ok(tools.length >= 18);
    for (const tl of tools) {
      assert.match(tl.name, /^[a-z_]+$/);
      assert.ok(tl.description.length > 30, `${tl.name} needs a real description`);
      assert.equal(tl.inputSchema.type, "object");
      assert.equal(tl.handler, undefined);
      for (const req of tl.inputSchema.required) assert.ok(tl.inputSchema.properties[req], `${tl.name}.${req}`);
    }
    assert.equal((await rpc("tools/call", { name: "nope", arguments: {} })).body.error.code, -32602);
  });

  await t.test("MCP: template app from a prompt-style flow", async () => {
    const guide = await tool("get_guide", { topic: "template-config" });
    assert.match(guide.content[0].text, /catalog/);
    const list = await tool("list_templates", { search: "salon" });
    assert.equal(list.structuredContent.templates[0].id, "salon-spa");
    const created = await tool("create_app", { name: "Glow Up", templateId: "salon-spa" });
    assert.equal(created.structuredContent.app.mode, "app");
    const id = created.structuredContent.app.id;
    const patched = await tool("patch_app_config", { appId: id, patch: { theme: { primary: "#0F766E" }, business: { phone: "+1 555 010 0199", social: null } } });
    assert.equal(patched.structuredContent.config.theme.primary, "#0F766E");
    assert.equal(patched.structuredContent.config.theme.secondary, "#F48FB1", "untouched keys survive a patch");
    assert.equal(patched.structuredContent.config.business.social, undefined);
    const bad = await tool("patch_app_config", { appId: id, patch: { theme: { primary: "teal" } } });
    assert.equal(bad.isError, true);
    assert.match(bad.content[0].text, /colour/);
    const renamed = await tool("update_app", { appId: id, packageName: "com.glowup.salon", versionName: "2.0.0" });
    assert.equal(renamed.structuredContent.app.packageName, "com.glowup.salon");
    const missing = await tool("get_app", {});
    assert.equal(missing.isError, true);
    assert.equal((await tool("get_app", { appId: id, extra: 1 })).isError, true, "unknown arguments are rejected");
    const queued = await tool("build_app", { appId: id, waitSeconds: 0 });
    assert.equal(queued.structuredContent.build.status, "queued");
    assert.match(queued.structuredContent.build.note, /get_build/);
    assert.ok(!(await tool("cancel_build", { buildId: queued.structuredContent.build.id })).isError);
    assert.equal((await tool("get_build", { buildId: queued.structuredContent.build.id })).structuredContent.build.status, "canceled");
    assert.equal((await tool("list_files", { appId: id })).isError, true, "template apps have no source files");
  });

  await t.test("code app: files through MCP and REST", async () => {
    const created = await tool("create_app", { name: "Tip Calc", mode: "code" });
    codeId = created.structuredContent.app.id;
    assert.deepEqual(created.structuredContent.files.sort(), ["app.js", "index.html", "style.css"]);
    const read = await tool("read_file", { appId: codeId, path: "index.html" });
    assert.equal(read.structuredContent.encoding, "utf8");
    assert.match(read.structuredContent.content, /<title>Tip Calc<\/title>/);

    const written = await tool("write_files", {
      appId: codeId,
      files: [
        { path: "js/main.js", content: "export const x = 1;\n" },
        { path: "img/dot.png", content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]).toString("base64"), encoding: "base64" },
        { path: ".git/config", content: "ignored" },
      ],
      delete: ["app.js"],
    });
    assert.deepEqual(written.structuredContent.written, ["js/main.js", "img/dot.png"]);
    assert.deepEqual(written.structuredContent.removed, ["app.js"]);
    assert.deepEqual(written.structuredContent.skipped, [".git/config"]);
    assert.equal((await tool("read_file", { appId: codeId, path: "img/dot.png" })).structuredContent.encoding, "base64");
    for (const path of ["../../etc/passwd", "a b.js", "/abs/../x"]) {
      const r = await tool("write_files", { appId: codeId, files: [{ path, content: "x" }] });
      assert.equal(r.isError, true, path);
    }
    const files = await s.call("GET", `/api/apps/${codeId}/files`, { token: user });
    assert.deepEqual(files.body.files.map((f) => f.path), ["img/dot.png", "index.html", "js/main.js", "style.css"]);
    assert.equal((await s.call("GET", `/api/apps/${codeId}/files`, { token: admin })).status, 200);
    const stranger = await s.register("stranger@example.com");
    assert.equal((await s.call("GET", `/api/apps/${codeId}/files`, { token: stranger })).status, 404, "files are private to the owner");
    assert.equal((await s.call("PUT", `/api/apps/${codeId}/files`, { token: stranger, body: { files: [{ path: "x.js", content: "1" }] } })).status, 404);
  });

  await t.test("limits on file count and size", async () => {
    const tiny = await startServer({ MAX_APP_FILES: "4", MAX_APP_FILE_MB: "1", MAX_APP_FILES_TOTAL_MB: "1" });
    try {
      const tk = await tiny.register("a@example.com");
      const { body } = await tiny.call("POST", "/api/apps", { token: tk, body: { name: "Small", mode: "code" } });
      const put = (files) => tiny.call("PUT", `/api/apps/${body.app.id}/files`, { token: tk, body: { files } });
      assert.equal((await put([{ path: "a.js", content: "1" }])).status, 200);
      assert.match((await put([{ path: "b.js", content: "1" }])).body.error, /Too many files/);
      assert.match((await put([{ path: "app.js", content: "x".repeat(1100000) }])).body.error, /too large/);
    } finally {
      await tiny.close();
    }
  });

  await t.test("ZIP import strips the wrapper folder and replaces files", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([makeZip({
      "my-app/index.html": "<html><head><title>z</title></head><body>zip</body></html>",
      "my-app/js/app.js": "console.log(1)",
      "my-app/node_modules/x/index.js": "junk",
      "my-app/.DS_Store": "junk",
    })]), "app.zip");
    const r = await s.call("POST", `/api/apps/${codeId}/files/zip`, { token: user, body: fd });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.written.sort(), ["index.html", "js/app.js"]);
    const files = await s.call("GET", `/api/apps/${codeId}/files`, { token: user });
    assert.deepEqual(files.body.files.map((f) => f.path), ["index.html", "js/app.js"], "old files are gone");
    const bad = new FormData();
    bad.append("file", new Blob(["not a zip"]), "x.zip");
    assert.equal((await s.call("POST", `/api/apps/${codeId}/files/zip`, { token: user, body: bad })).status, 400);
  });

  await t.test("preview is sandboxed and token-protected", async () => {
    const { previewUrl } = (await tool("get_preview_url", { appId: codeId })).structuredContent;
    assert.match(previewUrl, /^http:\/\/apps\.example\.test\/preview\//);
    const path = new URL(previewUrl).pathname;
    const page = await s.call("GET", path, { raw: true });
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /^sandbox /);
    assert.doesNotMatch(page.headers.get("content-security-policy"), /allow-same-origin/, "user code must not get the builder's origin");
    const html = await page.text();
    assert.match(html, /<head><script>.*localStorage/s, "storage shim is injected");
    assert.match(html, /zip<\/body>/);
    const js = await s.call("GET", path.replace("index.html", "js/app.js"), { raw: true });
    assert.match(js.headers.get("content-type"), /text\/javascript/);
    assert.equal((await s.call("GET", path.replace("index.html", "missing.js"), { raw: true })).status, 404);
    assert.equal((await s.call("GET", "/preview/forged.token/index.html", { raw: true })).status, 403);
    assert.equal((await s.call("GET", path.replace("index.html", "..%2F..%2Fsecret.key"), { raw: true })).status, 404);
  });

  await t.test("build preconditions for developer apps", async () => {
    await s.call("PUT", `/api/apps/${codeId}/files`, { token: user, body: { delete: ["index.html"] } });
    const r = await tool("build_app", { appId: codeId, waitSeconds: 0 });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /index\.html/);
  });

  await t.test("native project builds follow the PROJECT_BUILDS policy", async () => {
    // default on-premise policy: administrators only
    const denied = await tool("create_app", { name: "Native", mode: "project" });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /not enabled/);
    assert.equal((await s.call("POST", "/api/apps", { token: user, body: { name: "N", templateId: "android-project" } })).status, 403);
    const ok = await s.call("POST", "/api/apps", { token: admin, body: { name: "Native Admin", mode: "project" } });
    assert.equal(ok.status, 201);
    const files = (await s.call("GET", `/api/apps/${ok.body.app.id}/files`, { token: admin })).body.files.map((f) => f.path);
    assert.ok(files.includes("settings.gradle"));
    assert.ok(files.includes("app/src/main/java/com/nativeadmin/app/MainActivity.java"));
    // a template app cannot be switched to project mode by a non-admin
    const plain = await s.call("POST", "/api/apps", { token: user, body: { name: "Plain" } });
    const cfg = { ...plain.body.app.config, mode: "project" };
    assert.equal((await s.call("PUT", `/api/apps/${plain.body.app.id}`, { token: user, body: { config: cfg } })).status, 403);
    assert.equal((await s.call("GET", "/api/system")).body.projectBuilds, "admin");

    const cloud = await startServer({ DEPLOYMENT_MODE: "cloud", SECRET_KEY: "k" });
    try {
      const owner = await cloud.register("owner@example.com");
      assert.equal((await cloud.call("POST", "/api/apps", { token: owner, body: { name: "N", mode: "project" } })).status, 403, "off by default in the cloud, even for admins");
      assert.equal((await cloud.call("POST", "/api/apps", { token: owner, body: { name: "C", mode: "code" } })).status, 201, "code apps are always available");
    } finally {
      await cloud.close();
    }
  });

  await t.test("duplicating and deleting an app carries its files", async () => {
    const dup = await s.call("POST", `/api/apps/${codeId}/duplicate`, { token: user });
    const files = await s.call("GET", `/api/apps/${dup.body.app.id}/files`, { token: user });
    assert.deepEqual(files.body.files.map((f) => f.path), ["js/app.js"]);
    await s.call("DELETE", `/api/apps/${dup.body.app.id}`, { token: user });
    const left = await s.ctx.db.get("SELECT COUNT(*) AS n FROM app_files WHERE app_id = ?", [dup.body.app.id]);
    assert.equal(Number(left.n), 0);
  });

  await t.test("bridge script is downloadable", async () => {
    const r = await s.call("GET", "/mcp-stdio.js", { raw: true });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /APK_CREATOR_API_KEY/);
  });
});
