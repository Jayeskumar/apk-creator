"use strict";

/*
 * MCP tools. Each tool calls the server's own REST API on behalf of the
 * authenticated user (see `api` in index.js), so validation, ownership checks
 * and quotas are exactly the ones the web UI is subject to.
 */
const { guide } = require("./guide");

class ToolError extends Error {}

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const appId = str("The app's id (from create_app or list_apps).");

/** RFC 7386 JSON merge patch. */
function mergePatch(target, patch) {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const out = target && typeof target === "object" && !Array.isArray(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
}

function summarizeApp(a) {
  const mode = (a.config && a.config.mode) || "app";
  return {
    id: a.id, name: a.name, mode, packageName: a.packageName, versionName: a.versionName, versionCode: a.versionCode,
    templateId: a.templateId, updatedAt: a.updatedAt,
    latestBuild: a.latestBuild ? summarizeBuild(a.latestBuild) : null,
  };
}

/** Pull the lines an assistant needs to fix a failed build out of a Gradle log. */
function extractErrors(log) {
  const lines = String(log || "").split("\n");
  const out = [];
  const push = (l) => { if (out.length < 60 && !out.includes(l)) out.push(l); };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/(^e: |\berror:|\bERROR:|AAPT: error|Execution failed for task|^> .*(failed|not found|Could not)|^✖ )/.test(l)) {
      push(l.trim());
      if (/\berror:/.test(l) && lines[i + 1] && !/error:/.test(lines[i + 1])) push(lines[i + 1].trimEnd()); // offending source line
    }
  }
  const at = lines.findIndex((l) => l.startsWith("* What went wrong:"));
  if (at >= 0) for (const l of lines.slice(at, at + 12)) { if (l.startsWith("* Try:")) break; if (l.trim()) push(l.trim()); }
  return out;
}

function summarizeBuild(b, { logTailChars = 0 } = {}) {
  const out = {
    id: b.id, appId: b.appId, status: b.status, format: b.format, versionName: b.versionName, versionCode: b.versionCode,
    packageName: b.packageName, createdAt: b.createdAt, finishedAt: b.finishedAt,
  };
  if (b.status === "success") Object.assign(out, { downloadUrl: b.downloadUrl, sizeBytes: b.size, sha256: b.sha256 });
  if (b.error) out.error = b.error;
  if (b.log !== undefined && (b.status === "failed" || logTailChars > 0)) {
    if (b.status === "failed") out.errors = extractErrors(b.log);
    out.logTail = b.log.slice(-(logTailChars || 4000));
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function defineTools(ctx) {
  const tools = [];
  const tool = (name, title, description, properties, required, handler, annotations = {}) =>
    tools.push({ name, title, description, inputSchema: { type: "object", properties, required, additionalProperties: false }, annotations, handler });
  const readOnly = { readOnlyHint: true, openWorldHint: false };
  const mutating = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

  tool("get_guide", "Read authoring guide",
    "Returns the reference you need before creating or editing an app: the template configuration schema, the rules for custom web (code) apps including the native bridge, or the requirements for native Android Gradle projects. Call it once for the mode you are about to use.",
    { topic: str("Which guide to read.", { enum: ["overview", "template-config", "code-app", "android-project"] }) }, ["topic"],
    async (a) => ({ text: guide(ctx, a.topic) }), readOnly);

  tool("list_templates", "List app templates",
    "Lists the available app templates (business templates such as restaurant, salon, clinic, plus developer templates). Use the id with create_app, or get_template to see the full configuration.",
    { search: str("Optional text to filter by name, category or description."), category: str("Optional exact category name.") }, [],
    async (a, api) => {
      const { templates } = await api("GET", "/api/templates");
      const q = (a.search || "").toLowerCase();
      const list = templates.filter((t) => (!a.category || t.category === a.category) &&
        (!q || `${t.name} ${t.category} ${t.description}`.toLowerCase().includes(q)));
      return { data: { templates: list.map((t) => ({ id: t.id, name: t.name, category: t.category, mode: t.mode, description: t.description, pages: t.pages.map((p) => `${p.title} (${p.type})`) })) } };
    }, readOnly);

  tool("get_template", "Get template configuration",
    "Returns a template's complete configuration JSON — a good worked example of the config schema.",
    { templateId: str("Template id from list_templates.") }, ["templateId"],
    async (a, api) => ({ data: (await api("GET", `/api/templates/${encodeURIComponent(a.templateId)}`)).template }), readOnly);

  tool("list_apps", "List my apps", "Lists the user's apps with their mode and latest build status.", {}, [],
    async (a, api) => ({ data: { apps: (await api("GET", "/api/apps")).apps.map(summarizeApp) } }), readOnly);

  tool("create_app", "Create an app",
    "Creates a new app. mode \"template\" (default) starts from a business template (templateId, default \"blank\"); \"website\" wraps an existing site (websiteUrl); \"code\" creates a custom web app from source files; \"project\" creates a native Android Gradle project. Code and project apps start with a small working example you then replace with write_files.",
    {
      name: str("App name shown under the launcher icon (max 50 characters)."),
      mode: str("What kind of app to create.", { enum: ["template", "website", "code", "project"] }),
      templateId: str("Template id for mode \"template\" (see list_templates)."),
      websiteUrl: str("https:// address for mode \"website\"."),
    }, ["name"],
    async (a, api) => {
      const body = { name: a.name };
      if (a.mode && a.mode !== "template") body.mode = a.mode;
      else body.templateId = a.templateId || "blank";
      if (a.websiteUrl) body.websiteUrl = a.websiteUrl;
      const { app } = await api("POST", "/api/apps", body);
      const out = { app: summarizeApp(app) };
      if (out.app.mode === "code" || out.app.mode === "project") out.files = (await api("GET", `/api/apps/${app.id}/files`)).files.map((f) => f.path);
      else out.config = app.config;
      return { data: out };
    }, mutating);

  tool("get_app", "Get app details",
    "Returns an app's settings and full configuration; for code/project apps also the list of source files.",
    { appId }, ["appId"],
    async (a, api) => {
      const { app } = await api("GET", `/api/apps/${a.appId}`);
      const out = { app: summarizeApp(app), leadsEndpoint: app.leadsEndpoint, config: app.config };
      if (out.app.mode === "code" || out.app.mode === "project") out.files = (await api("GET", `/api/apps/${app.id}/files`)).files.map((f) => ({ path: f.path, size: f.size }));
      return { data: out };
    }, readOnly);

  tool("update_app", "Update app identity",
    "Changes the app's name, Android package name (e.g. com.company.app) or version name. Changing the package name of an app that was already built makes Android treat it as a different app; pass confirmPackageChange: true to do it anyway.",
    {
      appId, name: str("New app name."), packageName: str("New package name, lowercase with dots."), versionName: str("Version shown to users, e.g. 1.2.0."),
      confirmPackageChange: { type: "boolean", description: "Required to change the package name after the first build." },
    }, ["appId"],
    async (a, api) => {
      const { appId: id, ...body } = a;
      return { data: { app: summarizeApp((await api("PUT", `/api/apps/${id}`, body)).app) } };
    }, { ...mutating, idempotentHint: true });

  tool("patch_app_config", "Patch app configuration",
    "Applies a JSON merge patch to the app configuration: nested objects are merged, arrays and plain values are replaced, null removes a key. Use it to change theme colours, business details, the launcher icon, or to replace the pages array. Returns the resulting configuration.",
    { appId, patch: { type: "object", description: "Merge patch, e.g. {\"theme\":{\"primary\":\"#0F766E\"}}. To edit pages send the complete \"pages\" array." } }, ["appId", "patch"],
    async (a, api) => {
      const { app } = await api("GET", `/api/apps/${a.appId}`);
      const config = mergePatch(app.config, a.patch);
      return { data: { config: (await api("PUT", `/api/apps/${a.appId}`, { config })).app.config } };
    }, { ...mutating, idempotentHint: true });

  tool("set_app_config", "Replace app configuration",
    "Replaces the whole app configuration with the given JSON (validated by the server). Prefer patch_app_config for small changes.",
    { appId, config: { type: "object", description: "Complete configuration document (see get_guide topic template-config)." } }, ["appId", "config"],
    async (a, api) => ({ data: { config: (await api("PUT", `/api/apps/${a.appId}`, { config: a.config })).app.config } }),
    { ...mutating, destructiveHint: true, idempotentHint: true });

  tool("list_files", "List source files", "Lists the source files of a code or project app.", { appId }, ["appId"],
    async (a, api) => ({ data: await api("GET", `/api/apps/${a.appId}/files`) }), readOnly);

  tool("read_file", "Read a source file",
    "Returns one source file of a code or project app. Text files come back as utf8, binary files as base64.",
    { appId, path: str("File path relative to the app root, e.g. index.html or app/build.gradle.") }, ["appId", "path"],
    async (a, api) => ({ data: await api("GET", `/api/apps/${a.appId}/files/content?path=${encodeURIComponent(a.path)}`) }), readOnly);

  tool("write_files", "Write source files",
    "Creates or overwrites source files of a code or project app, and optionally deletes files. Send several files in one call. With replaceAll: true every existing file not in this call is removed (use it when uploading a whole new project).",
    {
      appId,
      files: {
        type: "array", description: "Files to create or overwrite.",
        items: {
          type: "object",
          properties: {
            path: str("Relative path using / separators; letters, digits and . _ - + @ only."),
            content: str("File content."),
            encoding: str("\"utf8\" (default) or \"base64\" for binary files.", { enum: ["utf8", "base64"] }),
          },
          required: ["path", "content"], additionalProperties: false,
        },
      },
      delete: { type: "array", items: { type: "string" }, description: "Paths to delete." },
      replaceAll: { type: "boolean", description: "Remove all existing files that are not part of this call." },
    }, ["appId"],
    async (a, api) => ({ data: await api("PUT", `/api/apps/${a.appId}/files`, { files: a.files || [], delete: a.delete || [], replaceAll: !!a.replaceAll }) }),
    { ...mutating, destructiveHint: true });

  tool("get_preview_url", "Get browser preview link",
    "Returns a temporary link (valid 6 hours) that runs a code app in a sandboxed browser page, for a quick look before building. Not available for native projects.",
    { appId }, ["appId"],
    async (a, api) => ({ data: { previewUrl: (await api("GET", `/api/apps/${a.appId}/preview-url`)).absoluteUrl } }), readOnly);

  tool("build_app", "Build APK / AAB",
    "Compiles the app into a signed Android package and, by default, waits for the result. Returns status \"success\" with a downloadUrl (valid 24 hours), or \"failed\" with the compiler errors and the end of the build log so you can fix the source and build again. If it is still running when the wait ends, poll with get_build.",
    {
      appId,
      format: str("\"apk\" to install directly (default) or \"aab\" for Google Play.", { enum: ["apk", "aab"] }),
      waitSeconds: { type: "integer", minimum: 0, maximum: 600, description: "How long to wait for the build to finish (default 180). 0 returns immediately." },
    }, ["appId"],
    async (a, api) => {
      const { build } = await api("POST", `/api/apps/${a.appId}/builds`, { format: a.format || "apk" });
      const deadline = Date.now() + Math.min(600, Math.max(0, a.waitSeconds === undefined ? 180 : a.waitSeconds)) * 1000;
      let current = build;
      while (["queued", "building"].includes(current.status) && Date.now() < deadline) {
        await sleep(1500);
        current = (await api("GET", `/api/builds/${build.id}`)).build;
      }
      const out = summarizeBuild(current);
      if (["queued", "building"].includes(current.status)) out.note = "Still running. Call get_build with this build id to check again.";
      return { data: { build: out }, isError: current.status === "failed" };
    }, mutating);

  tool("get_build", "Get build status and log",
    "Returns a build's status; on success the downloadUrl, on failure the extracted errors and the end of the log.",
    { buildId: str("Build id from build_app or list_builds."), logTailChars: { type: "integer", minimum: 0, maximum: 60000, description: "Return this many characters from the end of the log (default 4000 on failure)." } }, ["buildId"],
    async (a, api) => ({ data: { build: summarizeBuild((await api("GET", `/api/builds/${a.buildId}`)).build, { logTailChars: a.logTailChars || 0 }) } }), readOnly);

  tool("list_builds", "List builds", "Lists an app's recent builds, newest first.", { appId }, ["appId"],
    async (a, api) => ({ data: { builds: (await api("GET", `/api/apps/${a.appId}/builds`)).builds.map((b) => summarizeBuild(b)) } }), readOnly);

  tool("cancel_build", "Cancel a build", "Cancels a queued or running build.", { buildId: str("Build id.") }, ["buildId"],
    async (a, api) => ({ data: await api("POST", `/api/builds/${a.buildId}/cancel`, {}) }), mutating);

  tool("list_leads", "List leads",
    "Lists messages, booking requests and orders that users submitted from inside the built app (forms set to send to the dashboard inbox).",
    { appId }, ["appId"],
    async (a, api) => ({ data: await api("GET", `/api/apps/${a.appId}/leads`) }), readOnly);

  return tools;
}

module.exports = { defineTools, ToolError, mergePatch, extractErrors };
