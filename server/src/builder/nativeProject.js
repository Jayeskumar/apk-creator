"use strict";

/*
 * Builds for "project" apps: a complete Android Gradle project supplied as
 * source files (typically AI-generated or exported from Android Studio).
 *
 * The project's own build scripts run on the worker, so this mode is gated by
 * the PROJECT_BUILDS policy. Release signing is injected from the app's
 * managed keystore, so projects never need to carry signing secrets.
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = "";
    let p;
    try {
      p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    } catch (e) {
      return resolve({ code: -1, out: e.message });
    }
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("error", (e) => resolve({ code: -1, out: e.message }));
    p.on("close", (code) => resolve({ code, out }));
  });
}

/** Newest installed build-tools directory, or null when no SDK is configured. */
function buildToolsDir(androidHome) {
  if (!androidHome) return null;
  const root = path.join(androidHome, "build-tools");
  if (!fs.existsSync(root)) return null;
  const versions = fs.readdirSync(root).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return versions.length ? path.join(root, versions[versions.length - 1]) : null;
}

async function prepareNativeProject({ dir, build, files, config, log = () => {} }) {
  const written = await files.materialize(build.app_id, dir);
  log(`Wrote ${written.length} project file(s)\n`);
  const has = (f) => fs.existsSync(path.join(dir, f));
  if (!has("settings.gradle") && !has("settings.gradle.kts")) {
    throw new Error("settings.gradle(.kts) not found at the project root");
  }
  if (config.build.androidHome) {
    const sdk = config.build.androidHome.replace(/\\/g, "\\\\");
    await fsp.writeFile(path.join(dir, "local.properties"), `sdk.dir=${sdk}\n`);
  }
  // The project's Gradle wrapper is only used when explicitly enabled: it
  // downloads a Gradle distribution, which fails on offline workers.
  let gradleCmd = config.build.gradleCmd;
  if (process.env.PROJECT_USE_GRADLE_WRAPPER === "true" && has("gradlew") && has("gradle/wrapper/gradle-wrapper.jar")) {
    await fsp.chmod(path.join(dir, "gradlew"), 0o755);
    gradleCmd = path.join(dir, "gradlew");
    log("Using the project's Gradle wrapper\n");
  }
  return { gradleCmd };
}

/** Gradle arguments; `printable` has the signing passwords masked for the build log. */
function gradleArgs({ dir, task, signing, config }) {
  const base = ["-p", dir, "--console=plain", ...(config.build.projectGradleOffline ? ["--offline"] : []), ...config.build.gradleArgs];
  const inject = [
    ["android.injected.signing.store.file", signing.storeFile, false],
    ["android.injected.signing.store.password", signing.storePassword, true],
    ["android.injected.signing.key.alias", signing.keyAlias, false],
    ["android.injected.signing.key.password", signing.keyPassword, true],
  ];
  return {
    args: [...base, ...inject.map(([k, v]) => `-P${k}=${v}`), task],
    printable: [...base, ...inject.map(([k, v, secret]) => `-P${k}=${secret ? "****" : path.basename(v)}`), task],
  };
}

async function walk(dir, out = [], depth = 0) {
  if (depth > 12) return out;
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".gradle" || e.name === "intermediates") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out, depth + 1);
    else out.push(p);
  }
  return out;
}

/** Finds the release APK/AAB a build produced, whatever the module is called. */
async function findArtifact(dir, format) {
  const marker = format === "aab" ? `${path.sep}outputs${path.sep}bundle${path.sep}` : `${path.sep}outputs${path.sep}apk${path.sep}`;
  const all = (await walk(dir)).filter((f) => f.endsWith(`.${format}`) && f.includes(marker) && !/androidTest/i.test(f));
  if (!all.length) return null;
  const score = (f) => (/release/i.test(f) ? 2 : 0) + (/unsigned/i.test(f) ? 0 : 1);
  return all.sort((a, b) => score(b) - score(a) || a.length - b.length)[0];
}

/**
 * Makes sure the artifact is signed with the app's key. Signing is normally
 * injected into Gradle; this is the fallback for projects where that did not
 * take effect.
 */
async function ensureSigned({ artifact, format, signing, config, workDir, log = () => {} }) {
  const tools = buildToolsDir(config.build.androidHome);
  if (format === "aab") {
    const check = await run("jarsigner", ["-verify", artifact]);
    if (check.code === 0 && /jar verified/i.test(check.out)) return artifact;
    log("Signing the app bundle with the app's key\n");
    const res = await run("jarsigner", ["-keystore", signing.storeFile, "-storetype", "PKCS12", "-storepass", signing.storePassword,
      "-keypass", signing.keyPassword, artifact, signing.keyAlias]);
    if (res.code !== 0) throw new Error(`Could not sign the app bundle: ${res.out.slice(-500)}`);
    return artifact;
  }
  if (!tools) return artifact;
  const verify = await run(path.join(tools, "apksigner"), ["verify", artifact]);
  if (verify.code === 0) return artifact;
  log("Signing the APK with the app's key\n");
  const aligned = path.join(workDir, "aligned.apk");
  const signed = path.join(workDir, "signed.apk");
  const align = await run(path.join(tools, "zipalign"), ["-f", "-p", "4", artifact, aligned]);
  if (align.code !== 0) throw new Error(`zipalign failed: ${align.out.slice(-500)}`);
  const sign = await run(path.join(tools, "apksigner"), ["sign", "--ks", signing.storeFile, "--ks-type", "PKCS12",
    "--ks-pass", `pass:${signing.storePassword}`, "--key-pass", `pass:${signing.keyPassword}`, "--ks-key-alias", signing.keyAlias,
    "--out", signed, aligned]);
  if (sign.code !== 0) throw new Error(`apksigner failed: ${sign.out.slice(-500)}`);
  return signed;
}

/** Reads the real package name and version from a built APK (best effort). */
async function readApkInfo(apk, config) {
  const tools = buildToolsDir(config.build.androidHome);
  if (!tools) return null;
  const res = await run(path.join(tools, "aapt2"), ["dump", "badging", apk]);
  const m = /package: name='([^']+)' versionCode='(\d*)' versionName='([^']*)'/.exec(res.out);
  return m ? { packageName: m[1], versionCode: parseInt(m[2], 10) || 0, versionName: m[3] } : null;
}

module.exports = { prepareNativeProject, gradleArgs, findArtifact, ensureSigned, readApkInfo, buildToolsDir };
