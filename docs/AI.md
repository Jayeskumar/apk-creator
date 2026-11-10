# AI-assisted development (MCP server)

APK Creator has a built-in [Model Context Protocol](https://modelcontextprotocol.io) server. Connect Claude (or any MCP client) and the assistant can create apps, write their code, compile them here and hand back a signed APK or AAB. When a build fails, it gets the compiler errors and can fix them itself.

It works in three ways:

| What you ask for | App mode | What the assistant does |
|---|---|---|
| "Make an app for my bakery with a menu and WhatsApp ordering" | `app` (template) | Picks a template and fills in the JSON configuration: pages, colours, business details, icon |
| "Write a tip calculator and package it as an Android app" | `code` | Writes HTML/CSS/JS files, uploads them, builds |
| "Compile this Android project and fix the build errors" | `project` | Uploads a Gradle project (Java/Kotlin), builds, reads errors, fixes, rebuilds |

## Connect an assistant

1. In the web app open **AI & API** and create an API key. It is shown once and acts as you.
2. Connect your client. The **AI & API** page shows these commands with your server address filled in.

**Claude Code**

```bash
claude mcp add --transport http apk-creator https://apps.example.com/mcp \
  --header "Authorization: Bearer apkc_YOUR_API_KEY"
```

**Claude Desktop** (and other clients that start a local command). Download the bridge from `https://apps.example.com/mcp-stdio.js` (a single file, needs Node.js 18+) and add it to the client's MCP configuration:

```json
{
  "mcpServers": {
    "apk-creator": {
      "command": "node",
      "args": ["/path/to/apk-creator-mcp.js"],
      "env": { "APK_CREATOR_URL": "https://apps.example.com", "APK_CREATOR_API_KEY": "apkc_YOUR_API_KEY" }
    }
  }
}
```

**Anything else:** the endpoint is `POST /mcp` (Streamable HTTP, stateless, JSON responses) with `Authorization: Bearer <key>`.

An on-premise server on a private address can only be reached by assistants running inside your network (Claude Code, Claude Desktop). Hosted assistants need a public HTTPS address.

## Tools

| Tool | Purpose |
|---|---|
| `get_guide` | Authoring reference for the assistant: template config schema, code-app rules and native bridge, native project requirements |
| `list_templates`, `get_template` | Browse templates and read their full configuration |
| `list_apps`, `get_app`, `create_app`, `update_app` | Manage apps; `create_app` takes `mode`: `template`, `website`, `code` or `project` |
| `patch_app_config`, `set_app_config` | Edit the configuration (JSON merge patch, or full replace) |
| `list_files`, `read_file`, `write_files` | Source files of code and project apps (text or base64) |
| `get_preview_url` | Temporary sandboxed browser preview of a code app |
| `build_app` | Build an APK or AAB and wait for the result |
| `get_build`, `list_builds`, `cancel_build` | Build status, download link, errors and log tail |
| `list_leads` | Form submissions from the built app |

`build_app` returns `status: "success"` with a `downloadUrl` (valid 24 hours), or `status: "failed"` with `errors` (compiler diagnostics with project-relative `file:line`, plus Gradle's "What went wrong") and `logTail`.

## Code apps (web code → APK)

A code app is a folder of files with `index.html` at the top. It is packaged into the native shell and served inside the app from the origin `https://app.local/`, so ES modules, `fetch()` of bundled files, `localStorage` and IndexedDB behave as they do on a web server.

- No build step runs: no npm, JSX or TypeScript. Plain files only.
- `window.ApkBridge` (only inside the APK) offers `openExternal(url)`, `share(title, text)`, `toast(msg)`, `setStatusBarColor(hex)`, `isOnline()` and `appVersion()`.
- The app name, package name, version, launcher icon and brand colour come from the app's settings.
- Camera, microphone, location and push notifications are not available in this mode. Use a native project for those.

You can also work without an assistant: **Templates → Developer & AI → Custom Web App**, then edit files in the browser, upload files, or import a ZIP.

## Native projects (Gradle project → APK/AAB)

A project app is a complete Android Gradle project. The worker runs `assembleRelease` or `bundleRelease` on it and signs the output with the app's managed key, which it injects at build time. Projects must not contain keystores or signing passwords.

Toolchain on the worker: JDK 17, Gradle 8.14, Android platform 35, build-tools 35.0.0 and 34.0.0. Android Gradle Plugin 8.7.3 is cached in the Docker image, so dependency-free projects on that version build with no internet access. Kotlin, AndroidX, Compose and other libraries are downloaded from Google Maven and Maven Central, so the worker needs internet access for them.

### Security: who may build projects

Gradle build scripts are programs. Building a project runs code chosen by the uploader on the build worker. That is why this mode is controlled by `PROJECT_BUILDS`:

| Value | Meaning | Default |
|---|---|---|
| `off` | Nobody can create or build project apps | cloud |
| `admin` | Administrators only | on-premise |
| `all` | Every user | never the default |

Before setting `all` on a shared server, run build workers as separate, isolated containers (the cloud layout does this) with no access to anything you would not give those users. The worker removes the server's secrets (`SECRET_KEY`, database and storage credentials) from the Gradle environment, and masks signing passwords in build logs, but it does not sandbox the build beyond the container it runs in.

Code apps and template apps do not run uploaded code at build time and are always available.

Related settings: `PROJECT_GRADLE_OFFLINE` (default `false`), `PROJECT_BUILD_TIMEOUT_SECONDS` (default `1800`), `PROJECT_USE_GRADLE_WRAPPER` (default `false`; when `true`, a project's own `gradlew` is used if it ships `gradle-wrapper.jar`).

## API keys and the REST API

API keys also work on the REST API (`Authorization: Bearer apkc_...`), for scripts and CI:

```bash
curl -H "Authorization: Bearer $KEY" https://apps.example.com/api/apps
curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"files":[{"path":"index.html","content":"<h1>Hello</h1>"}]}' \
  https://apps.example.com/api/apps/APP_ID/files
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"format":"apk"}' https://apps.example.com/api/apps/APP_ID/builds
```

Only a SHA-256 hash of each key is stored. A key cannot create or revoke keys; that needs a signed-in session. Revoke keys on the **AI & API** page.

## Limits

`MAX_APP_FILES` (600 files per app), `MAX_APP_FILE_MB` (5 MB per file) and `MAX_APP_FILES_TOTAL_MB` (40 MB per app). Build outputs, `.git`, `node_modules`, `local.properties` and keystore files are skipped on upload.
