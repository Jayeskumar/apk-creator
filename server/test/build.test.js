"use strict";

/*
 * Real Android build through the worker. Runs only when an Android SDK is
 * available (ANDROID_HOME) — set SKIP_ANDROID_BUILD=1 to skip explicitly.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { startServer } = require("./helpers");
const { BuildWorker } = require("../src/builder/worker");

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const skip = !sdk || !fs.existsSync(sdk) || process.env.SKIP_ANDROID_BUILD === "1";

test("builds, signs and serves a real APK", { skip: skip && "ANDROID_HOME not set", timeout: 15 * 60 * 1000 }, async (t) => {
  const s = await startServer({ ANDROID_HOME: sdk });
  const worker = new BuildWorker({ ...s.ctx, logger: { log() {}, error: console.error } });
  t.after(async () => { await worker.stop(); await s.close(); });
  worker.start();

  const token = await s.register("builder@example.com");
  const { body } = await s.call("POST", "/api/apps", { token, body: { templateId: "salon-spa", name: "Café L'Étoile & Spa" } });
  const appId = body.app.id;

  const waitFor = async (buildId) => {
    for (let i = 0; i < 600; i++) {
      const r = await s.call("GET", `/api/builds/${buildId}`, { token });
      if (!["queued", "building"].includes(r.body.build.status)) return r.body.build;
      await new Promise((res) => setTimeout(res, 1000));
    }
    throw new Error("build timed out");
  };

  const first = await waitFor((await s.call("POST", `/api/apps/${appId}/builds`, { token, body: { format: "apk" } })).body.build.id);
  assert.equal(first.status, "success", first.log && first.log.slice(-3000));
  assert.ok(first.size > 10000);
  assert.match(first.sha256, /^[0-9a-f]{64}$/);

  const dl = await s.call("GET", new URL(first.downloadUrl).pathname + new URL(first.downloadUrl).search, { raw: true });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get("content-type"), "application/vnd.android.package-archive");
  const apk = path.join(s.dataDir, "test.apk");
  fs.writeFileSync(apk, Buffer.from(await dl.arrayBuffer()));

  const tools = path.join(sdk, "build-tools");
  const bt = fs.existsSync(tools) ? fs.readdirSync(tools).sort().pop() : null;
  if (bt) {
    const badging = execFileSync(path.join(tools, bt, "aapt2"), ["dump", "badging", apk], { encoding: "utf8" });
    assert.match(badging, /package: name='com\.cafeletoilespa\.app' versionCode='1' versionName='1\.0\.0'/);
    assert.match(badging, /application-label:'Café L'Étoile & Spa'/);
    const certs = (f) => execFileSync(path.join(tools, bt, "apksigner"), ["verify", "--print-certs", f], { encoding: "utf8" })
      .split("\n").find((l) => l.includes("SHA-256"));
    const cert1 = certs(apk);
    assert.ok(cert1, "APK is signed");

    // Second build reuses the same signing key so it installs as an update.
    const second = await waitFor((await s.call("POST", `/api/apps/${appId}/builds`, { token, body: { format: "apk" } })).body.build.id);
    assert.equal(second.status, "success");
    assert.equal(second.versionCode, 2);
    const dl2 = await s.call("GET", new URL(second.downloadUrl).pathname + new URL(second.downloadUrl).search, { raw: true });
    const apk2 = path.join(s.dataDir, "test2.apk");
    fs.writeFileSync(apk2, Buffer.from(await dl2.arrayBuffer()));
    assert.equal(certs(apk2), cert1, "same signing certificate across builds");
  }

  const ks = await s.call("GET", `/api/apps/${appId}/keystore`, { token });
  assert.equal(ks.body.alias, "release");
  assert.ok(ks.body.password.length >= 16);
  const ksFile = await s.call("GET", ks.body.downloadUrl, { raw: true });
  assert.equal(ksFile.status, 200);
});

test("AI workflow over MCP: compiles web code and a native project, reports compiler errors", { skip: skip && "ANDROID_HOME not set", timeout: 20 * 60 * 1000 }, async (t) => {
  const s = await startServer({ ANDROID_HOME: sdk, SECRET_KEY: "server-secret-value" });
  const worker = new BuildWorker({ ...s.ctx, logger: { log() {}, error: console.error } });
  t.after(async () => { await worker.stop(); await s.close(); });
  worker.start();

  const session = await s.register("dev@example.com"); // first account = admin, may build native projects
  const key = (await s.call("POST", "/api/keys", { token: session, body: { name: "ci" } })).body.key;
  const tool = async (name, args) => (await s.call("POST", "/mcp", { token: key, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } })).body.result;
  const fetchArtifact = async (build, file) => {
    const u = new URL(build.downloadUrl);
    const res = await s.call("GET", u.pathname + u.search, { raw: true });
    assert.equal(res.status, 200);
    const out = path.join(s.dataDir, file);
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    return out;
  };
  const bt = path.join(sdk, "build-tools", fs.readdirSync(path.join(sdk, "build-tools")).sort().pop());

  // --- web code written "by the assistant", using ES modules and a bundled JSON file
  const code = (await tool("create_app", { name: "Tip Calculator", mode: "code" })).structuredContent.app;
  await tool("write_files", { appId: code.id, replaceAll: true, files: [
    { path: "index.html", content: '<!doctype html><html><head><title>Tip</title></head><body><h1 id="t"></h1><script type="module" src="js/main.js"></script></body></html>' },
    { path: "js/main.js", content: 'import { tip } from "./tip.js";\nconst rates = await (await fetch("data/rates.json")).json();\ndocument.getElementById("t").textContent = tip(100, rates.default);\n' },
    { path: "js/tip.js", content: "export const tip = (amount, pct) => (amount * pct) / 100;\n" },
    { path: "data/rates.json", content: '{"default":15}' },
  ] });
  const codeBuild = (await tool("build_app", { appId: code.id })).structuredContent.build;
  assert.equal(codeBuild.status, "success", JSON.stringify(codeBuild));
  const codeApk = await fetchArtifact(codeBuild, "code.apk");
  const listing = execFileSync("unzip", ["-l", codeApk], { encoding: "utf8" });
  for (const f of ["assets/www/index.html", "assets/www/js/main.js", "assets/www/js/tip.js", "assets/www/data/rates.json", "assets/www/offline.html"]) {
    assert.ok(listing.includes(f), `${f} is bundled`);
  }
  assert.ok(!listing.includes("assets/www/config.js"), "the template runtime is not bundled into code apps");
  assert.match(execFileSync(path.join(bt, "aapt2"), ["dump", "badging", codeApk], { encoding: "utf8" }), /package: name='com\.tipcalculator\.app'/);
  assert.match(execFileSync(path.join(bt, "aapt2"), ["dump", "resources", codeApk], { encoding: "utf8" }), /"https:\/\/app\.local\/index\.html"/);

  // --- native Gradle project: the starter compiles and is signed with the app's managed key
  const created = (await tool("create_app", { name: "Native Counter", mode: "project" })).structuredContent;
  const projectId = created.app.id;
  const javaPath = created.files.find((f) => f.endsWith("MainActivity.java"));
  const ok = (await tool("build_app", { appId: projectId })).structuredContent.build;
  assert.equal(ok.status, "success", JSON.stringify(ok));
  assert.equal(ok.packageName, "com.nativecounter.app", "package name is read from the built APK");
  const nativeApk = await fetchArtifact(ok, "native.apk");
  assert.match(execFileSync(path.join(bt, "apksigner"), ["verify", "--print-certs", nativeApk], { encoding: "utf8" }), /CN=Native Counter/);
  const fullLog = (await s.call("GET", `/api/builds/${ok.id}`, { token: session })).body.build.log;
  assert.match(fullLog, /store\.password=\*\*\*\*/, "signing passwords are masked in the log");
  const ks = (await s.call("GET", `/api/apps/${projectId}/keystore`, { token: session })).body;
  assert.ok(!fullLog.includes(ks.password), "the keystore password never appears in the build log");

  // --- a compile error comes back as actionable diagnostics, then the fix builds (as AAB)
  const source = (await tool("read_file", { appId: projectId, path: javaPath })).structuredContent.content;
  await tool("write_files", { appId: projectId, files: [{ path: javaPath, content: source.replace('button.setText("Tap me");', "button.setText(undefinedVariable);") }] });
  const failed = await tool("build_app", { appId: projectId });
  assert.equal(failed.isError, true);
  assert.equal(failed.structuredContent.build.status, "failed");
  const errors = failed.structuredContent.build.errors.join("\n");
  assert.match(errors, /^app\/src\/main\/java\/com\/nativecounter\/app\/MainActivity\.java:\d+: error: cannot find symbol/m, "errors use project-relative paths");
  assert.match(errors, /undefinedVariable/);

  // Gradle scripts run without the server's secrets in their environment.
  await tool("write_files", { appId: projectId, files: [
    { path: javaPath, content: source },
    { path: "build.gradle", content: "plugins {\n    id 'com.android.application' version '8.7.3' apply false\n}\nprintln('ENVCHECK ' + System.getenv('SECRET_KEY'))\n" },
  ] });
  const aab = (await tool("build_app", { appId: projectId, format: "aab" })).structuredContent.build;
  assert.equal(aab.status, "success", JSON.stringify(aab));
  assert.match(execFileSync("jarsigner", ["-verify", await fetchArtifact(aab, "native.aab")], { encoding: "utf8" }), /jar verified/);
  const aabLog = (await s.call("GET", `/api/builds/${aab.id}`, { token: session })).body.build.log;
  assert.match(aabLog, /ENVCHECK null/);
  assert.ok(!aabLog.includes("server-secret-value"));
});
