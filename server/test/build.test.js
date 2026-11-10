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
