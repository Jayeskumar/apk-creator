"use strict";

/*
 * Source files of "code" and "project" apps, plus the sandboxed browser
 * preview for "code" apps.
 */
const express = require("express");
const path = require("node:path");
const security = require("../security");
const { bad, notFound, HttpError, authenticate, uploader, h } = require("../http");
const { decodeEntries, normalizePath } = require("../files");
const { loadOwnedApp } = require("./apps");

const MIME = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json", map: "application/json", txt: "text/plain; charset=utf-8", xml: "application/xml",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm", wasm: "application/wasm",
};

/*
 * Previews run with an opaque origin (CSP sandbox), where localStorage throws.
 * Give apps an in-memory stand-in so they behave like they do inside the APK.
 */
const PREVIEW_SHIM = `<script>(function(){function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}["localStorage","sessionStorage"].forEach(function(n){try{window[n].getItem("x")}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}})})();</script>`;

async function loadFileApp(ctx, req) {
  const row = await loadOwnedApp(ctx, req);
  const mode = JSON.parse(row.config).mode;
  if (mode !== "code" && mode !== "project") throw bad("This app is built from a template and has no source files");
  return row;
}

function fileRoutes(ctx) {
  const r = express.Router({ mergeParams: true });
  r.use(authenticate(ctx));

  r.get("/", h(async (req, res) => {
    const row = await loadFileApp(ctx, req);
    res.json({ files: await ctx.files.list(row.id) });
  }));

  r.get("/content", h(async (req, res) => {
    const row = await loadFileApp(ctx, req);
    const file = await ctx.files.readEncoded(row.id, req.query.path);
    if (!file) throw notFound("File not found");
    res.json(file);
  }));

  // Create/replace files: { files: [{ path, content, encoding? }], delete?: [paths], replaceAll?: bool }
  r.put("/", h(async (req, res) => {
    const row = await loadFileApp(ctx, req);
    const body = req.body || {};
    const entries = decodeEntries(body.files || []);
    const remove = Array.isArray(body.delete) ? body.delete : [];
    if (!entries.length && !remove.length) throw bad("Nothing to write");
    res.json(await ctx.files.write(row.id, entries, { replaceAll: !!body.replaceAll, remove }));
  }));

  r.delete("/", h(async (req, res) => {
    const row = await loadFileApp(ctx, req);
    if (!req.query.path) throw bad("path is required");
    res.json(await ctx.files.write(row.id, [], { remove: [req.query.path] }));
  }));

  r.post("/zip", uploader(ctx, ctx.config.limits.maxAppFilesTotalMb), h(async (req, res) => {
    const row = await loadFileApp(ctx, req);
    if (!req.file) throw bad("No file uploaded");
    res.json(await ctx.files.importZip(row.id, req.file.buffer, { replaceAll: req.query.merge !== "1" }));
  }));

  return r;
}

/** GET /preview/<signed token>/<path> — serves a code app with an opaque origin. */
function previewRoutes(ctx) {
  const r = express.Router();

  r.get("/:token/{*path}", h(async (req, res) => {
    const payload = security.verify(ctx.config.secretKey, req.params.token);
    if (!payload || payload.t !== "pv") throw new HttpError(403, "Preview link is invalid or has expired");
    const segments = [].concat(req.params.path || []).filter(Boolean);
    let filePath;
    try {
      filePath = normalizePath(segments.length ? segments.join("/") : "index.html");
    } catch {
      throw notFound();
    }
    const data = await ctx.files.read(payload.app, filePath);
    if (!data) throw notFound(`${filePath} not found`);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    // The sandbox directive gives the page an opaque origin: user code can never
    // read the builder's session, even if the link is opened in its own tab.
    res.set("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads");
    // Opaque-origin pages load module scripts and fetch() bundled files cross-origin.
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "no-store");
    res.set("Content-Type", MIME[ext] || "application/octet-stream");
    if (ext === "html" || ext === "htm") {
      const html = data.toString("utf8");
      const at = html.search(/<head[^>]*>/i);
      const end = at >= 0 ? at + html.match(/<head[^>]*>/i)[0].length : 0;
      return res.send(html.slice(0, end) + PREVIEW_SHIM + html.slice(end));
    }
    res.send(data);
  }));

  return r;
}

module.exports = { fileRoutes, previewRoutes };
