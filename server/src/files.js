"use strict";

/*
 * Source-file store for "code" (custom web app) and "project" (Android Gradle
 * project) apps — the apps typically written by an AI assistant or a developer.
 *
 * Metadata lives in the app_files table; content lives in object storage under
 * appfiles/<appId>/<sha256>, so arbitrary (validated) paths never become
 * storage keys and identical files are stored once.
 */
const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const security = require("./security");
const { ValidationError } = require("./validation");
const { readZip } = require("./zip");

const SEGMENT = /^[A-Za-z0-9._@+-]+$/;
const IGNORED_DIRS = new Set([".git", ".gradle", ".idea", ".kotlin", "build", "node_modules", "__MACOSX", ".cxx"]);
const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db", "local.properties"]);
const IGNORED_EXT = /\.(jks|keystore|p12|apk|aab|iml)$/i;

/** Returns a clean relative path, or throws a ValidationError explaining why not. */
function normalizePath(input) {
  let p = String(input == null ? "" : input).replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
  if (!p) throw new ValidationError("File path is empty");
  if (p.length > 240) throw new ValidationError(`File path is too long: ${p.slice(0, 60)}…`);
  const segs = p.split("/");
  if (segs.length > 20) throw new ValidationError(`File path is nested too deeply: ${p}`);
  for (const seg of segs) {
    if (!seg || seg === "." || seg === "..") throw new ValidationError(`Invalid file path: ${p}`);
    if (!SEGMENT.test(seg)) {
      throw new ValidationError(`Invalid file path "${p}": use only letters, digits, and . _ - + @ in file and folder names`);
    }
  }
  return segs.join("/");
}

/** Build outputs, VCS folders, signing keys etc. are never stored. */
function isIgnored(p) {
  const segs = p.split("/");
  const name = segs[segs.length - 1];
  return segs.slice(0, -1).some((s) => IGNORED_DIRS.has(s)) || IGNORED_FILES.has(name) || IGNORED_EXT.test(name);
}

function isText(buf) {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

class AppFiles {
  constructor(ctx) {
    this.db = ctx.db;
    this.storage = ctx.storage;
    this.limits = ctx.config.limits;
  }

  blobKey(appId, sha) {
    return `appfiles/${appId}/${sha}`;
  }

  async list(appId) {
    const rows = await this.db.all("SELECT path, size, sha256, updated_at FROM app_files WHERE app_id = ? ORDER BY path", [appId]);
    return rows.map((r) => ({ path: r.path, size: Number(r.size), sha256: r.sha256, updatedAt: r.updated_at }));
  }

  async read(appId, filePath) {
    const p = normalizePath(filePath);
    const row = await this.db.get("SELECT sha256 FROM app_files WHERE app_id = ? AND path = ?", [appId, p]);
    if (!row) return null;
    return this.storage.get(this.blobKey(appId, row.sha256));
  }

  /** Read as { path, encoding: "utf8" | "base64", content }. */
  async readEncoded(appId, filePath) {
    const buf = await this.read(appId, filePath);
    if (!buf) return null;
    const text = isText(buf);
    return { path: normalizePath(filePath), size: buf.length, encoding: text ? "utf8" : "base64", content: buf.toString(text ? "utf8" : "base64") };
  }

  /**
   * Create or replace files.
   * @param {{path: string, data: Buffer}[]} entries
   * @param {{replaceAll?: boolean, remove?: string[]}} opts
   */
  async write(appId, entries, { replaceAll = false, remove = [] } = {}) {
    const incoming = new Map();
    const skipped = [];
    for (const e of entries) {
      const p = normalizePath(e.path);
      if (isIgnored(p)) { skipped.push(p); continue; }
      if (!Buffer.isBuffer(e.data)) throw new ValidationError(`No content for ${p}`);
      if (e.data.length > this.limits.maxAppFileMb * 1048576) {
        throw new ValidationError(`${p} is too large (max ${this.limits.maxAppFileMb} MB per file)`);
      }
      incoming.set(p, e.data);
    }
    const removals = new Set(remove.map(normalizePath));
    const existing = await this.list(appId);
    const kept = existing.filter((f) => !incoming.has(f.path) && !removals.has(f.path) && !replaceAll);

    const count = kept.length + incoming.size;
    if (count > this.limits.maxAppFiles) throw new ValidationError(`Too many files (${count} > ${this.limits.maxAppFiles})`);
    let total = kept.reduce((n, f) => n + f.size, 0);
    for (const data of incoming.values()) total += data.length;
    if (total > this.limits.maxAppFilesTotalMb * 1048576) {
      throw new ValidationError(`Files exceed the ${this.limits.maxAppFilesTotalMb} MB total limit for one app`);
    }

    const now = security.now();
    for (const [p, data] of incoming) {
      const sha = crypto.createHash("sha256").update(data).digest("hex");
      await this.storage.put(this.blobKey(appId, sha), data);
      await this.db.run("DELETE FROM app_files WHERE app_id = ? AND path = ?", [appId, p]);
      await this.db.run("INSERT INTO app_files (app_id, path, size, sha256, updated_at) VALUES (?, ?, ?, ?, ?)", [appId, p, data.length, sha, now]);
    }
    const gone = existing.filter((f) => (replaceAll && !incoming.has(f.path)) || removals.has(f.path));
    for (const f of gone) await this.db.run("DELETE FROM app_files WHERE app_id = ? AND path = ?", [appId, f.path]);
    await this.collectGarbage(appId, existing.map((f) => f.sha256));
    await this.db.run("UPDATE apps SET updated_at = ? WHERE id = ?", [now, appId]);
    return { written: [...incoming.keys()], removed: gone.map((f) => f.path), skipped };
  }

  /** Delete blobs that no file of this app references any more. */
  async collectGarbage(appId, candidates) {
    const live = new Set((await this.list(appId)).map((f) => f.sha256));
    for (const sha of new Set(candidates)) {
      if (!live.has(sha)) await this.storage.delete(this.blobKey(appId, sha)).catch(() => {});
    }
  }

  async removeAll(appId) {
    const files = await this.list(appId);
    await this.db.run("DELETE FROM app_files WHERE app_id = ?", [appId]);
    for (const sha of new Set(files.map((f) => f.sha256))) await this.storage.delete(this.blobKey(appId, sha)).catch(() => {});
  }

  async copyAll(fromAppId, toAppId) {
    const entries = [];
    for (const f of await this.list(fromAppId)) entries.push({ path: f.path, data: await this.storage.get(this.blobKey(fromAppId, f.sha256)) });
    if (entries.length) await this.write(toAppId, entries, { replaceAll: true });
  }

  /** Replace all files with the contents of a ZIP archive. */
  async importZip(appId, zipBuffer, { replaceAll = true } = {}) {
    let entries = readZip(zipBuffer, {
      maxEntries: this.limits.maxAppFiles * 4,
      maxEntryBytes: this.limits.maxAppFileMb * 1048576,
      maxTotalBytes: this.limits.maxAppFilesTotalMb * 1048576 * 2,
    }).map((e) => ({ path: e.path.replace(/\\/g, "/").replace(/^\/+/, ""), data: e.data }))
      .filter((e) => e.path && !isIgnored(e.path));
    if (!entries.length) throw new ValidationError("The archive contains no usable files");
    // Archives usually wrap everything in one top-level folder: strip it.
    const first = entries[0].path.split("/")[0];
    if (entries.every((e) => e.path.includes("/") && e.path.split("/")[0] === first)) {
      entries = entries.map((e) => ({ path: e.path.slice(first.length + 1), data: e.data }));
    }
    return this.write(appId, entries, { replaceAll });
  }

  /** Write every file into a directory (used by the build worker). */
  async materialize(appId, dir) {
    const files = await this.list(appId);
    const root = path.resolve(dir);
    for (const f of files) {
      const dest = path.resolve(root, normalizePath(f.path));
      if (!dest.startsWith(root + path.sep)) throw new Error(`Refusing to write outside the build directory: ${f.path}`);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await this.storage.downloadTo(this.blobKey(appId, f.sha256), dest);
    }
    return files;
  }
}

/** Decode API/MCP file entries ({path, content, encoding}) into buffers. */
function decodeEntries(files) {
  if (!Array.isArray(files)) throw new ValidationError("files must be an array of { path, content }");
  return files.map((f) => {
    if (!f || typeof f.path !== "string" || typeof f.content !== "string") {
      throw new ValidationError("Each file needs a string path and string content");
    }
    const encoding = f.encoding === "base64" ? "base64" : "utf8";
    return { path: f.path, data: Buffer.from(f.content, encoding) };
  });
}

module.exports = { AppFiles, normalizePath, isIgnored, isText, decodeEntries };
