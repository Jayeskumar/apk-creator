"use strict";

const express = require("express");
const path = require("node:path");
const multer = require("multer");
const { ValidationError } = require("./validation");
const { HttpError } = require("./http");
const { TemplateRegistry } = require("./templates");
const { buildRoutes, downloadRoutes } = require("./routes/builds");
const { fileRoutes, previewRoutes } = require("./routes/files");
const { mcpRoutes } = require("./mcp");
const { AppFiles } = require("./files");
const pkg = require("../package.json");

/**
 * Builds the Express application. `ctx` holds shared services:
 *   { config, db, storage, templates?, worker? }
 */
function createApp(ctx) {
  ctx.templates = ctx.templates || new TemplateRegistry({ db: ctx.db, extraDir: ctx.config.extraTemplatesDir });
  ctx.files = ctx.files || new AppFiles(ctx);
  const app = express();
  app.disable("x-powered-by");
  if (ctx.config.trustProxy) app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "same-origin");
    res.set("X-Frame-Options", "SAMEORIGIN");
    next();
  });

  // Public lead capture has its own CORS + body handling, mount before JSON parser.
  app.use("/api/public", require("./routes/public")(ctx));

  // Source-file uploads and MCP calls carry file contents: allow larger JSON bodies there.
  const bigJson = express.json({ limit: `${ctx.config.limits.maxAppFilesTotalMb * 2}mb` });
  app.use("/mcp", bigJson, mcpRoutes(ctx));
  app.use("/api/apps/:id/files", bigJson, fileRoutes(ctx));
  app.use("/preview", previewRoutes(ctx));
  app.use(express.json({ limit: `${ctx.config.limits.maxConfigKb + 64}kb` }));

  app.get("/api/health", async (req, res) => {
    try {
      await ctx.db.get("SELECT 1 AS ok");
      res.json({ ok: true, version: pkg.version });
    } catch (e) {
      res.status(503).json({ ok: false, error: e.message });
    }
  });

  app.get("/api/system", (req, res) => {
    res.json({
      brandName: ctx.config.brandName,
      mode: ctx.config.mode,
      version: pkg.version,
      allowSignup: ctx.config.auth.allowSignup,
      publicUrl: ctx.config.publicUrl,
      // off | admin | all: who may build native Gradle projects on this server
      projectBuilds: ctx.config.build.projectBuilds,
      limits: { maxAppsPerUser: ctx.config.limits.maxAppsPerUser, maxBuildsPerDay: ctx.config.limits.maxBuildsPerDay, maxUploadMb: ctx.config.limits.maxUploadMb },
    });
  });

  app.use("/api/auth", require("./routes/auth")(ctx));
  app.use("/api/keys", require("./routes/keys")(ctx));
  app.use("/api/templates", require("./routes/templates")(ctx));
  app.use("/api", downloadRoutes(ctx));
  app.use("/api/apps", require("./routes/apps")(ctx));
  app.use("/api/builds", buildRoutes(ctx));
  app.use("/api/media", require("./routes/media")(ctx));
  app.use("/api/admin", require("./routes/admin")(ctx));

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

  // Stdio bridge for MCP clients that cannot connect over HTTP (downloadable from the AI page).
  app.get("/mcp-stdio.js", (req, res) => res.type("text/javascript").sendFile(path.join(__dirname, "..", "bin", "mcp-stdio.js")));

  // Builder UI + the shared app runtime (used by the live preview).
  app.use("/runtime", express.static(ctx.config.build.runtimeDir, { maxAge: 0 }));
  app.use(express.static(ctx.config.webDir, { index: "index.html", maxAge: 0 }));
  app.get("/{*path}", (req, res) => res.sendFile(path.join(ctx.config.webDir, "index.html")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    let message = err.message;
    if (err instanceof multer.MulterError) {
      status = 400;
      message = err.code === "LIMIT_FILE_SIZE" ? `File is too large (max ${ctx.config.limits.maxUploadMb} MB)` : err.message;
    } else if (err.type === "entity.too.large") {
      status = 413;
      message = "Request is too large";
    } else if (!(err instanceof HttpError) && !(err instanceof ValidationError) && status >= 500) {
      console.error("[api]", req.method, req.originalUrl, err);
      message = "Something went wrong on the server";
    }
    res.status(status).json({ error: message });
  });

  return app;
}

module.exports = { createApp };
