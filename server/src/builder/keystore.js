"use strict";

/*
 * Every app gets its own release signing key, created on its first build and
 * reused for all later builds so that updates install over older versions
 * (and Google Play accepts them). The keystore file lives in object storage;
 * its password is encrypted with SECRET_KEY in the database.
 */
const path = require("node:path");
const { spawn } = require("node:child_process");
const security = require("../security");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited with ${code}: ${out.slice(-2000)}`))));
  });
}

function dnameComponent(s) {
  return String(s || "").replace(/[^A-Za-z0-9 ._-]/g, "").trim().slice(0, 60) || "App";
}

/**
 * Ensures the app has a keystore and downloads it into workDir.
 * @returns {Promise<{storeFile, storePassword, keyAlias, keyPassword}>}
 */
async function ensureKeystore({ db, storage, config, appId, appName, workDir, log = () => {} }) {
  const app = await db.get("SELECT id, keystore FROM apps WHERE id = ?", [appId]);
  if (!app) throw new Error("App not found");
  const file = path.join(workDir, "release.p12");
  const storageKey = `keystores/${appId}.p12`;

  if (app.keystore && (await storage.exists(storageKey))) {
    const info = JSON.parse(security.decrypt(config.secretKey, app.keystore));
    await storage.downloadTo(storageKey, file);
    return { storeFile: file, storePassword: info.password, keyAlias: info.alias, keyPassword: info.password };
  }

  log("Generating a new release signing key for this app\n");
  const password = security.randomPassword(24);
  const alias = "release";
  await run(config.build.keytoolCmd, [
    "-genkeypair", "-noprompt",
    "-keystore", file,
    "-storetype", "PKCS12",
    "-storepass", password,
    "-keypass", password,
    "-alias", alias,
    "-keyalg", "RSA",
    "-keysize", "2048",
    "-validity", "10000",
    "-dname", `CN=${dnameComponent(appName)}, O=${dnameComponent(appName)}, C=US`,
  ]);
  await storage.putFile(storageKey, file);
  const encrypted = security.encrypt(config.secretKey, JSON.stringify({ alias, password, createdAt: security.now() }));
  await db.run("UPDATE apps SET keystore = ? WHERE id = ?", [encrypted, appId]);
  return { storeFile: file, storePassword: password, keyAlias: alias, keyPassword: password };
}

async function keystoreInfo({ db, config, appId }) {
  const app = await db.get("SELECT keystore FROM apps WHERE id = ?", [appId]);
  if (!app || !app.keystore) return null;
  return JSON.parse(security.decrypt(config.secretKey, app.keystore));
}

module.exports = { ensureKeystore, keystoreInfo };
