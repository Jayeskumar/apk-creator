"use strict";

/*
 * Turns an app configuration into a ready-to-build Android Gradle project:
 * copies the template + shared runtime, bundles uploaded media, writes app
 * name/colours/launcher icon resources and the per-app build properties.
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const MEDIA_REF = /^(?:https?:\/\/[^/]+)?\/api\/media\/([A-Za-z0-9_-]{8,64}\.(?:png|jpe?g|webp|gif))$/;

function xmlText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape a string for an Android string resource. */
function androidString(s) {
  let out = xmlText(String(s).replace(/\\/g, "\\\\"))
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
  if (/^[@?]/.test(out)) out = "\\" + out;
  return out;
}

function hexOr(c, fallback) {
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : fallback;
}

/** Java .properties value escaping (we only write ASCII-safe values). */
function propValue(v) {
  return String(v).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[^\x20-\x7E]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

async function copyTemplate(templateDir, dest) {
  await fsp.cp(templateDir, dest, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(templateDir, src);
      return !/(^|[\\/])(build|\.gradle|\.idea)([\\/]|$)/.test(rel) && !/local\.properties$|apkcreator\.properties$/.test(rel);
    },
  });
}

/** Find every uploaded-media reference in the config and rewrite it to a bundled asset path. */
function collectMedia(config) {
  const keys = new Set();
  const walk = (v) => {
    if (typeof v === "string") {
      const m = MEDIA_REF.exec(v);
      if (m) {
        keys.add(m[1]);
        return `media/${m[1]}`;
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return { config: walk(config), keys: [...keys] };
}

function launcherForeground(ICONS, symbol, color) {
  const d = ICONS[symbol] || ICONS.star;
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group android:scaleX="2.5" android:scaleY="2.5" android:translateX="24" android:translateY="24">
        <path android:fillColor="${color}" android:pathData="${d}" />
    </group>
</vector>
`;
}

function splashLogo(ICONS, symbol, color) {
  const d = ICONS[symbol] || ICONS.star;
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="96dp"
    android:height="96dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path android:fillColor="${color}" android:pathData="${d}" />
</vector>
`;
}

/**
 * @param {object} opts
 * @param {string} opts.dir          destination project directory
 * @param {object} opts.build        build row (app_name, package_name, version_*, config, icon_key)
 * @param {object} opts.storage      storage driver
 * @param {object} opts.config       server config
 * @param {object} [opts.signing]    { storeFile, storePassword, keyAlias, keyPassword }
 * @param {function} [opts.log]
 */
async function prepareProject({ dir, build, storage, config, signing, files, log = () => {} }) {
  const b = config.build;
  await copyTemplate(b.templateDir, dir);
  const main = path.join(dir, "app", "src", "main");
  const www = path.join(main, "assets", "www");
  const res = path.join(main, "res");

  // 1. Shared runtime + config
  await fsp.mkdir(www, { recursive: true });
  const appConfig = JSON.parse(build.config);
  const customCode = appConfig.mode === "code";
  if (customCode) {
    // Custom web app: the user's (or their AI assistant's) files are the app.
    if (!files) throw new Error("File store is not available for this build");
    await fsp.copyFile(path.join(b.runtimeDir, "offline.html"), path.join(www, "offline.html"));
    const written = await files.materialize(build.app_id, www);
    if (!written.some((f) => f.path === "index.html")) throw new Error("index.html not found at the top level of the app files");
    log(`Bundled ${written.length} source file(s)\n`);
  } else {
    for (const f of await fsp.readdir(b.runtimeDir)) {
      const src = path.join(b.runtimeDir, f);
      if ((await fsp.stat(src)).isFile()) await fsp.copyFile(src, path.join(www, f));
    }
  }
  appConfig.appId = build.app_id;
  appConfig.appName = build.app_name;
  appConfig.leadsEndpoint = `${config.publicUrl}/api/public/leads/${build.app_id}`;
  appConfig.version = build.version_name;
  appConfig.builtAt = new Date().toISOString();

  const { config: bundled, keys } = collectMedia(appConfig);
  if (keys.length) {
    await fsp.mkdir(path.join(www, "media"), { recursive: true });
    for (const key of keys) {
      try {
        await storage.downloadTo(`media/${key}`, path.join(www, "media", key));
      } catch (e) {
        log(`warning: media ${key} is missing (${e.message})\n`);
      }
    }
    log(`Bundled ${keys.length} media file(s)\n`);
  }
  if (!customCode) await fsp.writeFile(path.join(www, "config.js"), `window.APP_CONFIG = ${JSON.stringify(bundled)};\n`);

  // 2. Resources: name, colours, launcher icon, splash
  const ICONS = require(path.join(b.runtimeDir, "icons.js"));
  const theme = appConfig.theme || {};
  const icon = appConfig.icon || {};
  const primary = hexOr(theme.primary, "#1E63E9");
  const background = theme.dark ? hexOr(theme.background, "#101114") : hexOr(theme.background, "#FFFFFF");
  const iconBg = hexOr(icon.background, primary);
  const iconFg = hexOr(icon.foreground, "#FFFFFF");
  const symbol = ICONS[icon.symbol] ? icon.symbol : "star";

  await fsp.writeFile(path.join(res, "values", "strings.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${androidString(build.app_name)}</string>\n` +
    `    <string name="start_url" translatable="false">${customCode ? "https://app.local/index.html" : "file:///android_asset/www/index.html"}</string>\n</resources>\n`);
  await fsp.writeFile(path.join(res, "values", "colors.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="brand_primary">${primary}</color>\n    <color name="brand_background">${background}</color>\n    <color name="ic_launcher_background">${iconBg}</color>\n</resources>\n`);
  await fsp.writeFile(path.join(res, "drawable", "ic_splash_logo.xml"), splashLogo(ICONS, symbol, primary));
  await fsp.writeFile(path.join(res, "drawable", "ic_launcher_foreground.xml"), launcherForeground(ICONS, symbol, iconFg));

  if (build.icon_key) {
    // Custom uploaded icon replaces the adaptive vector icon.
    const ext = path.extname(build.icon_key).toLowerCase() === ".png" ? ".png" : path.extname(build.icon_key).toLowerCase();
    const mipmap = path.join(res, "mipmap-xxxhdpi");
    await fsp.mkdir(mipmap, { recursive: true });
    await storage.downloadTo(build.icon_key, path.join(mipmap, `ic_launcher${ext}`));
    await fsp.rm(path.join(res, "mipmap-anydpi-v26", "ic_launcher.xml"), { force: true });
    log("Using custom launcher icon\n");
  }

  // 3. Build properties consumed by app/build.gradle
  const props = {
    applicationId: build.package_name,
    versionCode: String(build.version_code),
    versionName: build.version_name,
  };
  if (signing) Object.assign(props, signing);
  await fsp.writeFile(path.join(dir, "apkcreator.properties"),
    Object.entries(props).map(([k, v]) => `${k}=${propValue(v)}`).join("\n") + "\n");

  if (b.androidHome) {
    await fsp.writeFile(path.join(dir, "local.properties"), `sdk.dir=${propValue(b.androidHome)}\n`);
  }
  // gradlew may lose its executable bit when copied from some storage backends.
  const gradlew = path.join(dir, "gradlew");
  if (fs.existsSync(gradlew)) await fsp.chmod(gradlew, 0o755);
  return { mediaCount: keys.length };
}

module.exports = { prepareProject, collectMedia, androidString, MEDIA_REF };
