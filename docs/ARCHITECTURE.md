# Architecture

APK Creator has four parts that share one data model: the **app configuration**, a JSON document describing an app's theme, business details and pages.

```
┌─────────────────────────── Builder UI (web/) ───────────────────────────┐
│ templates gallery · editor (design/business/pages/settings/build/leads)│
│  ┌──────────── sandboxed iframe ────────────┐                           │
│  │ runtime/ (live preview, postMessage)     │                           │
│  └──────────────────────────────────────────┘                           │
└───────────────┬─────────────────────────────────────────────────────────┘
                │ REST (Bearer token)
┌───────────────▼──────────── API (server/src) ───────────────────────────┐
│ auth · apps · media · builds · leads (public) · admin · templates       │
│        │ db/ (SQLite | Postgres)          │ storage/ (disk | S3)        │
└────────┼──────────────────────────────────┼─────────────────────────────┘
         │ builds table = queue             │ media, icons, keystores, APKs
┌────────▼──────────── Build worker(s) (server/src/builder) ──────────────┐
│ claim job → copy android-template → bundle runtime + config + media     │
│ → write resources (name, colours, icon) → keystore → gradle → upload    │
└─────────────────────────────────────────────────────────────────────────┘
```

## App configuration

```jsonc
{
  "schemaVersion": 1,
  "mode": "app",                 // or "website" (wraps website.url)
  "appName": "Bella Cucina",
  "theme": { "primary": "#B3261E", "secondary": "#F2A900", "dark": false,
             "font": "serif", "corners": "rounded", "headerStyle": "solid" },
  "icon": { "symbol": "restaurant", "background": "#B3261E", "foreground": "#FFFFFF" },
  "navigation": "bottom",        // or "drawer"
  "business": { "name": "…", "phone": "…", "whatsapp": "…", "email": "…", "address": "…",
                "currency": "$", "hours": [{ "label": "Mon – Fri", "value": "9–6" }], "social": {} },
  "features": { "floatingButton": "whatsapp", "shareText": "" },
  "pages": [
    { "id": "home", "type": "home", "title": "Home", "icon": "home", "heroTitle": "…", "ctaAction": "menu" },
    { "id": "menu", "type": "catalog", "title": "Menu", "icon": "restaurant", "enableOrders": true,
      "items": [{ "name": "Margherita", "price": 12, "category": "Pizza", "image": "/api/media/…" }] }
  ]
}
```

Page types: `home, about, text, catalog, pricing, booking, gallery, team, testimonials, faq, offers, events, links, contact, web`. The editor builds its forms from `web/js/schema.js`, the runtime renders each type in `runtime/app.js`, and the server checks structure and size limits in `server/src/validation.js`.

At build time the server adds `appId`, `leadsEndpoint` (`PUBLIC_URL/api/public/leads/<appId>`), `version` and `builtAt`. Clients can never set these.

## Runtime (`runtime/`)

A dependency-free HTML/CSS/JS single-page app (≈40 KB) that renders a configuration. It uses hash routing (`#/p/<page>`, `#/p/<page>/<item>`, `#/cart`), so the Android back button works through WebView history.

- **In the APK** the configuration is baked into `assets/www/config.js`, and the runtime talks to the native shell through `window.ApkBridge` (open external apps, share, toast, status bar colour).
- **In the builder** it runs in a sandboxed iframe (`allow-scripts allow-forms`, no same-origin) and receives the configuration through `postMessage`. Because it's the same code, the preview matches the shipped app.

Everything rendered is HTML-escaped, and URLs are restricted to safe schemes (`http(s)`, `tel`, `mailto`, `geo`, `whatsapp`, `intent`).

Forms (contact, booking, order) send their data through one of:
- `whatsapp`: a pre-filled WhatsApp message to the business number
- `email`: a `mailto:` link
- `server`: `POST` to the leads endpoint as `text/plain` (no CORS preflight from `file://`), falling back to WhatsApp if that fails

## Android shell (`android-template/`)

A single-activity Java app with **no AndroidX or third-party dependencies**, which keeps APKs around 40 KB plus your images, and builds fast. It is minSdk 26, targetSdk 35.

- WebView with DOM storage, file chooser, download handling, a progress bar, and an offline page with retry.
- `http(s)` stays in-app. `tel:`, `mailto:`, `whatsapp:`, `geo:` and `intent:` go to the system (with a `wa.me` fallback when WhatsApp isn't installed).
- Cleartext is allowed so apps can reach on-premise servers on a LAN.
- Per-app values come from `apkcreator.properties` (application ID, version, signing) plus generated resources (`strings.xml`, `colors.xml`, adaptive launcher icon vector, splash logo).

The template is a normal Gradle project, so you can open it in Android Studio to change native behaviour. Builds pick up your changes automatically.

## Build pipeline (`server/src/builder/`)

1. `POST /api/apps/:id/builds` validates the config, increments `version_code`, and stores an immutable **snapshot** (config, name, package, icon) as a `queued` row. Only one build per app can be active at a time.
2. A worker **claims** the oldest queued build atomically:
   SQLite uses `UPDATE … WHERE id = (SELECT …) RETURNING *` (single writer), and Postgres adds `FOR UPDATE SKIP LOCKED`. This lets any number of workers share one queue without a message broker.
3. `keystore.js` creates a PKCS#12 release key per app on its first build (`keytool`). It's stored in object storage, and its password is encrypted with `SECRET_KEY` in the database. Every later build reuses it.
4. `project.js` copies the template, the runtime and the config, rewrites `/api/media/<key>` references to bundled `media/<key>` files, and writes resources and build properties.
5. Gradle runs `assembleRelease` (APK) or `bundleRelease` (AAB). Output streams into the build log, which is flushed to the DB every 2 s. Each flush doubles as a heartbeat, and the same tick picks up cancellation.
6. The artifact is uploaded to storage with its size and SHA-256. Download links are HMAC-signed and valid for 24 h, so they can be opened on a phone without logging in.

Builds that time out, are cancelled, or whose worker disappears (stale heartbeat) are marked failed or cancelled.

## Data model

| Table | Purpose |
|---|---|
| `users` | accounts (scrypt hashes, role, disabled) |
| `apps` | owner, name, unique package name, config JSON, icon key, version, encrypted keystore info |
| `builds` | queue and history: snapshot, status, log, artifact key, checksum, worker, heartbeat |
| `media` | uploaded images (owner, type, size) |
| `leads` | form submissions from apps |
| `custom_templates` | templates saved by admins |

Schema migrations are an append-only list in `server/src/db/schema.js`, using portable SQL (TEXT/INTEGER/BIGINT, ISO timestamps).

## On-premise vs cloud

| | On-premise default | Cloud |
|---|---|---|
| Process layout | 1 container: API + embedded worker | API replicas + worker deployment (autoscaled) |
| Database | SQLite in `DATA_DIR` | PostgreSQL (`DATABASE_URL`) |
| Storage | local directory | S3-compatible (`STORAGE_DRIVER=s3`) |
| Secret | auto-generated `DATA_DIR/secret.key` | `SECRET_KEY` (required, shared by all replicas) |
| Quotas | unlimited | `MAX_APPS_PER_USER=10`, `MAX_BUILDS_PER_DAY=20` |
| Internet | not required (offline Gradle cache in image) | required for users only |

You can also mix these, for example on-premise with Postgres and MinIO and several build servers.
