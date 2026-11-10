"use strict";

/*
 * Validation and sanitisation of user-supplied app data. The runtime escapes
 * everything it renders, so the goal here is structural integrity and sane
 * size limits rather than HTML filtering.
 */

const PAGE_TYPES = new Set([
  "home", "about", "text", "catalog", "gallery", "team", "testimonials", "faq",
  "offers", "events", "pricing", "links", "contact", "booking", "web",
]);

/*
 * app      pages rendered by the shared runtime (templates)
 * website  wraps an existing website
 * code     custom web app from source files (HTML/CSS/JS), e.g. AI-generated
 * project  complete Android Gradle project from source files
 */
const APP_MODES = new Set(["app", "website", "code", "project"]);

const JAVA_KEYWORDS = new Set(("abstract assert boolean break byte case catch char class const continue default do double else enum " +
  "extends final finally float for goto if implements import instanceof int interface long native new package private " +
  "protected public return short static strictfp super switch synchronized this throw throws transient try void volatile " +
  "while true false null var record yield").split(" "));

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function isValidPackageName(name) {
  if (typeof name !== "string" || name.length > 150) return false;
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(name)) return false;
  return name.split(".").every((seg) => !JAVA_KEYWORDS.has(seg));
}

function slug(text, max = 24) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, max);
}

function suggestPackageName(appName) {
  let s = slug(appName, 20) || "app";
  if (!/^[a-z]/.test(s)) s = "app" + s;
  if (JAVA_KEYWORDS.has(s)) s += "app";
  return `com.${s}.app`;
}

function isHexColor(c) {
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
}

/** Deep clone limiting depth, string length, array length and key count. */
function clamp(value, depth = 0) {
  if (depth > 8) throw new ValidationError("Configuration is nested too deeply");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return value.length > 20000 ? value.slice(0, 20000) : value;
  if (Array.isArray(value)) {
    if (value.length > 500) throw new ValidationError("A list in the configuration has too many entries (max 500)");
    return value.map((v) => clamp(v, depth + 1));
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length > 200) throw new ValidationError("Too many fields in configuration object");
    const out = {};
    for (const k of keys) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      if (k.length > 64) continue;
      out[k] = clamp(value[k], depth + 1);
    }
    return out;
  }
  return null;
}

function validateConfig(input, { maxKb = 512 } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ValidationError("config must be an object");
  const size = Buffer.byteLength(JSON.stringify(input));
  if (size > maxKb * 1024) throw new ValidationError(`Configuration is too large (${Math.round(size / 1024)} KB > ${maxKb} KB)`);
  const cfg = clamp(input);

  cfg.schemaVersion = 1;
  cfg.mode = APP_MODES.has(cfg.mode) ? cfg.mode : "app";
  cfg.appName = String(cfg.appName || "").trim().slice(0, 50);
  cfg.navigation = cfg.navigation === "drawer" ? "drawer" : "bottom";

  cfg.theme = cfg.theme && typeof cfg.theme === "object" ? cfg.theme : {};
  for (const key of ["primary", "secondary", "background", "surface", "text"]) {
    if (cfg.theme[key] !== undefined && cfg.theme[key] !== "" && !isHexColor(cfg.theme[key])) {
      throw new ValidationError(`theme.${key} must be a colour like #1E63E9`);
    }
  }
  if (!isHexColor(cfg.theme.primary)) cfg.theme.primary = "#1E63E9";

  cfg.business = cfg.business && typeof cfg.business === "object" ? cfg.business : {};
  cfg.features = cfg.features && typeof cfg.features === "object" ? cfg.features : {};

  if (cfg.mode === "website") {
    const url = cfg.website && cfg.website.url;
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw new ValidationError("Website URL must start with http:// or https://");
  }

  // "code" (web source files) and "project" (Gradle project) apps keep their
  // content in the app file store, not in pages.
  if (cfg.mode === "code" || cfg.mode === "project") cfg.pages = [];
  if (!Array.isArray(cfg.pages)) cfg.pages = [];
  if (cfg.pages.length > 40) throw new ValidationError("An app can have at most 40 pages");
  const seen = new Set();
  cfg.pages = cfg.pages.map((p, i) => {
    if (!p || typeof p !== "object") throw new ValidationError(`Page ${i + 1} is invalid`);
    if (!PAGE_TYPES.has(p.type)) throw new ValidationError(`Page ${i + 1} has unknown type "${p.type}"`);
    let pid = String(p.id || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || `${p.type}${i}`;
    while (seen.has(pid)) pid += "x";
    seen.add(pid);
    return { ...p, id: pid, title: String(p.title || p.type).slice(0, 40) };
  });

  // Never trust these from clients; they are injected by the server.
  delete cfg.leadsEndpoint;
  delete cfg.appId;
  return cfg;
}

function validateVersionName(v) {
  if (typeof v !== "string" || !/^[0-9A-Za-z._-]{1,30}$/.test(v)) {
    throw new ValidationError("Version must look like 1.0.0");
  }
  return v;
}

module.exports = {
  ValidationError, PAGE_TYPES, APP_MODES, isValidPackageName, suggestPackageName, validateConfig, validateVersionName, isHexColor, slug,
};
