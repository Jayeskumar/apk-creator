"use strict";

/*
 * Authoring guides served to AI assistants through the `get_guide` MCP tool.
 * They are the contract an assistant needs to produce apps that build on the
 * first try, so keep them precise and in sync with the runtime and the worker.
 */
const path = require("node:path");

const INSTRUCTIONS = `APK Creator builds Android apps (signed APK / AAB files) from three kinds of source:

1. TEMPLATE apps ("app" mode): a JSON configuration (theme, business details, pages such as catalog, booking, gallery). Best for business apps. No code needed.
2. CODE apps ("code" mode): a web app you write as files (index.html + CSS/JS/assets) that is packaged into a native Android shell. Best for custom tools, games, calculators, dashboards.
3. PROJECT apps ("project" mode): a complete native Android Gradle project (Java/Kotlin) that is compiled as-is. Use only when the user needs native code. May be disabled on this server.

Typical flow: call get_guide for the mode you will use -> create_app -> edit (patch_app_config, or write_files) -> build_app -> if the build fails, read the returned errors/log, fix the files, build again -> give the user the downloadUrl.

Rules:
- Read the guide for a mode before writing its config or files; the schemas are specific.
- Builds take roughly 15-60 seconds (native projects can take minutes). build_app waits for the result by default.
- Never invent a download link: only use the downloadUrl returned by build_app / get_build.
- App changes are saved immediately and affect the user's real apps. Ask before overwriting an existing app's files or config wholesale.`;

function templateConfigGuide(ctx) {
  const ICONS = require(path.join(ctx.config.build.runtimeDir, "icons.js"));
  return `# Template apps: configuration reference

A template app is one JSON document. Start from a template (list_templates / get_template), create the app with create_app, then change it with patch_app_config (JSON merge patch: objects merge, arrays and scalars are replaced, null deletes a key). To change one page you must send the whole "pages" array.

## Top level
{
  "mode": "app",
  "appName": "Bella Cucina",
  "theme": { "primary": "#B3261E", "secondary": "#F2A900", "dark": false,
             "font": "system|rounded|serif|condensed|mono", "corners": "rounded|pill|square", "headerStyle": "solid|light" },
  "icon": { "symbol": "<icon name>", "background": "#RRGGBB", "foreground": "#RRGGBB" },
  "navigation": "bottom|drawer",
  "business": { "name", "tagline", "description", "logo", "phone", "whatsapp", "email", "website", "address", "mapQuery",
                "currency": "$", "hours": [{ "label": "Mon – Fri", "value": "9 AM – 6 PM" }],
                "social": { "facebook", "instagram", "x", "youtube", "linkedin", "tiktok" } },
  "features": { "floatingButton": "whatsapp|call|none", "shareText": "" },
  "pages": [ ... ]
}
Colours must be 6-digit hex (#RRGGBB). With bottom navigation the first 4 pages are tabs and the rest go under "More"; max 40 pages.

## Pages
Every page: { "id": "lowercase-unique", "type": "<type>", "title": "Menu", "icon": "<icon name>", "hidden": false, ...fields }

| type | fields |
|---|---|
| home | heroTitle, heroSubtitle, heroImage, ctaLabel, ctaAction, intro, showQuickActions, highlightsTitle, highlights[{icon,title,text}], showShortcuts |
| about | image, content (markdown-lite), stats[{value,label}] |
| text | image, content (markdown-lite) |
| catalog | intro, layout "list|grid", showPrices, enableOrders (cart + checkout), orderVia, enquireLabel, items[{name, price (number), category, description, details, badge, image}] |
| pricing | intro, buttonLabel, items[{name, price, period, features (one per line), highlighted}] |
| booking | intro, serviceLabel, services (one per line), askDate, askTime, askGuests, buttonLabel, submitVia |
| gallery | intro, images[{image, caption}] |
| team | intro, members[{name, role, bio, photo}] |
| testimonials | items[{name, text, rating 1-5}] |
| faq | items[{question, answer}] |
| offers | items[{title, description, code, validUntil, image}] |
| events | items[{title, date "YYYY-MM-DD", time, location, description}] |
| links | items[{label, url, icon}] |
| contact | intro, showHours, showForm, formTitle, submitVia (details come from "business") |
| web | url (shows a web page inside the app) |

- ctaAction: "call", "whatsapp", "email", "map", "website", or the id of another page.
- submitVia / orderVia: "server" (lands in the app's leads inbox; read with list_leads), "whatsapp", or "email".
- Images: an https:// URL. Leave "" for none (the app shows a tasteful placeholder).
- markdown-lite: paragraphs, "- " bullet lists, **bold**, *italic*, [link](https://...).
- Website wrapper instead of pages: { "mode": "website", "website": { "url": "https://..." } }.

## Icon names
${Object.keys(ICONS).filter((n) => !["back", "chevron", "close", "plus", "minus", "menu"].includes(n)).join(", ")}

## Example patch
patch_app_config({ "appId": "...", "patch": { "theme": { "primary": "#0F766E" }, "business": { "phone": "+1 555 010 0199" } } })`;
}

const CODE_GUIDE = `# Code apps: custom web app packaged as an Android app

Create with create_app({ name, mode: "code" }). The app starts with a working example (index.html, style.css, app.js). Replace or extend it with write_files, then build_app.

## Rules
- The entry point is index.html at the top level. Use relative URLs for everything ("style.css", "js/app.js", "img/logo.png").
- Inside the app the files are served from the origin https://app.local/ in a WebView (Android 8+, modern Chromium). ES2020+, ES modules with relative imports, fetch() of your own bundled files ("data/items.json"), CSS grid/flex, localStorage, IndexedDB, canvas, audio/video all work.
- Bundle everything. Do not rely on CDNs unless the app is useless offline anyway; there is no build step, so no npm imports, no JSX, no TypeScript, no bare module specifiers ("import x from 'react'" will not resolve).
- Single-page apps: use hash routing (#/page). The Android back button follows WebView history, so hash navigation gives correct back behaviour.
- File names: letters, digits and . _ - + @ only (no spaces). Max 5 MB per file. Binary files (images, fonts) are sent with encoding "base64".
- Design for phones: <meta name="viewport" content="width=device-width, initial-scale=1">, touch targets >= 44px, no hover-only UI.
- Calls to other servers need CORS on that server (the app's origin is https://app.local). Plain http:// endpoints are allowed.

## Native bridge (only inside the APK: always feature-detect)
if (window.ApkBridge) { ... }
- ApkBridge.openExternal(url)      open a URL in the right app: https:, tel:, mailto:, sms:, geo:, whatsapp://send?phone=...&text=...
- ApkBridge.share(title, text)     Android share sheet
- ApkBridge.toast(message)         short native toast
- ApkBridge.setStatusBarColor("#RRGGBB")
- ApkBridge.isOnline()             boolean
- ApkBridge.appVersion()           versionName string
Links with tel:, mailto:, whatsapp:, geo: schemes are routed to the right app automatically; http(s) links open inside the app.
Not available: camera/microphone/location permissions, push notifications, background services. If the user needs those, use a native project.

## App identity
Name, package name, version, launcher icon and brand colour come from the app settings, not from your files:
- update_app({ appId, name, packageName, versionName })
- patch_app_config({ appId, patch: { "icon": { "symbol": "<icon name>", "background": "#RRGGBB", "foreground": "#FFFFFF" }, "theme": { "primary": "#RRGGBB" } } })  (theme.primary colours the splash screen and status bar)

## Collecting form submissions (optional)
POST JSON as text/plain to the app's leadsEndpoint (returned by get_app): { "kind": "contact|booking|order", "data": { "name": "...", "phone": "...", ... } }. Read them with list_leads.

## Testing
get_preview_url returns a link that runs the app in a sandboxed browser page (storage is in-memory there, ApkBridge is absent). Then build_app({ appId }) and share the downloadUrl.`;

function projectGuide(ctx) {
  const policy = ctx.config.build.projectBuilds;
  return `# Project apps: compile a native Android Gradle project

Availability on this server: ${policy === "off" ? "DISABLED (PROJECT_BUILDS=off). Use a code app instead." : policy === "admin" ? "administrators only." : "enabled for all users."}

Create with create_app({ name, mode: "project" }). The app starts with a minimal working Java project; replace it with write_files({ replaceAll: true, files: [...] }) or edit individual files, then build_app. If the build fails, build_app returns the compiler/Gradle errors: fix those files and build again.

## Toolchain on the build worker
- JDK 17, Gradle 8.14 (the system Gradle is used; a gradle wrapper in the project is ignored unless the server enables it)
- Android SDK: platform android-35, build-tools 35.0.0 and 34.0.0. Set buildToolsVersion "35.0.0" in the android { } block so the build never tries to download another version.
- Android Gradle Plugin 8.7.3 is cached for offline use. Other plugin/library versions (Kotlin, AndroidX, Compose, Material) are downloaded from google() / mavenCentral() and only work when the worker has internet access${ctx.config.build.projectGradleOffline ? " — THIS SERVER BUILDS OFFLINE, so use only AGP 8.7.3 and no external dependencies" : ""}.

## Requirements
- settings.gradle or settings.gradle.kts at the top level, with google() and mavenCentral() in pluginManagement and dependencyResolutionManagement.
- An application module (conventionally "app") applying com.android.application, with namespace, compileSdk 35, buildToolsVersion "35.0.0", minSdk >= 21 (26 recommended), targetSdk 35.
- The release variant must build: tasks used are assembleRelease (APK) and bundleRelease (AAB). Keep minifyEnabled false unless you provide ProGuard rules; set lint { abortOnError false; checkReleaseBuilds false } to avoid lint-only failures.
- Do NOT add signingConfigs, keystores or passwords: release signing with the app's managed key is injected automatically. Do not include local.properties, build/ or .gradle/ (they are ignored).
- Package name (applicationId) and version come from YOUR build.gradle in this mode; the values in the app settings are informational.
- Keep it dependency-light when you can: plain Android framework APIs (android.app.Activity, android.widget.*) build fastest and work offline.

## Minimal layout
settings.gradle
build.gradle                       plugins { id 'com.android.application' version '8.7.3' apply false }
gradle.properties                  org.gradle.jvmargs=-Xmx1536m
app/build.gradle
app/src/main/AndroidManifest.xml   launcher activity must have android:exported="true"
app/src/main/java/<package path>/MainActivity.java (or .kt with the Kotlin plugin)
app/src/main/res/values/strings.xml

Use read_file to inspect the starter project for a known-good baseline before writing your own.

## Reading build failures
build_app returns { status: "failed", errors: [...], logTail: "..." }. "errors" lists compiler diagnostics (file:line: error: ...) and Gradle's "What went wrong" section. Fix exactly those, re-upload the changed files with write_files, and build again.`;
}

function guide(ctx, topic) {
  switch (topic) {
    case "template-config": return templateConfigGuide(ctx);
    case "code-app": return CODE_GUIDE;
    case "android-project": return projectGuide(ctx);
    default: return `${INSTRUCTIONS}\n\nGuides: get_guide({ topic: "template-config" | "code-app" | "android-project" })`;
  }
}

module.exports = { guide, INSTRUCTIONS };
