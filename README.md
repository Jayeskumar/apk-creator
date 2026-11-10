# APK Creator

**A no-code Android app builder for businesses.** Pick from 30 business templates, customise them in a visual editor with a live phone preview, and download a signed APK (or a Google Play–ready AAB) in about a minute.

It runs **on-premise** (one Docker container, SQLite, local disk, works offline) and **in the cloud** (Postgres, S3-compatible storage, horizontally scaled build workers). It's the same code in both cases; environment variables switch between them.

---

## Features

**For business owners**
- **30 templates** in 16 categories: restaurant, café, food delivery, retail, fashion, grocery, salon & spa, gym, medical clinic, dental, pharmacy, real estate, law firm, consulting, accounting, IT company, school/coaching, hotel, travel agency, events & weddings, photography, auto repair, home services, pet care, church, NGO, logistics, freelancer, **website-to-app**, and a blank starter.
- **15 page types:** home (hero, quick actions, highlights), about, catalog/menu/services (categories, prices, badges, details), pricing plans, booking/appointments, gallery with lightbox, team, reviews, FAQ, offers & coupons, events/schedule, links, contact (hours, social, map), text, embedded web page.
- **Orders, bookings and lead capture:** cart with checkout sent via WhatsApp, email, or the built-in **leads inbox** (with CSV export).
- **Branding:** 12 colour presets or custom colours, dark mode, fonts, corner styles, header styles, bottom tabs or side drawer, floating WhatsApp/Call button.
- **App icon:** pick from 48 symbols on your brand colour (adaptive icon), or upload your own logo.
- **Live preview:** the preview runs the exact same runtime that ships inside the APK.
- **Website to app:** wrap an existing site, with an offline screen, file uploads, downloads, and external links opened in the right app.

**For the platform**
- **Real native builds:** a clean Gradle project per build. Each app gets its **own release signing key**, so updates install over old versions and Play accepts them. You can download the keystore for backup.
- **APK and AAB** output, with auto-incrementing version codes, build logs streamed live, cancel, 24h shareable download links, and SHA-256 checksums.
- **Multi-user:** accounts, admin role, user management, per-user app and build quotas, and sign-up on/off.
- **Custom templates:** admins can save any app as a template; on-prem installs can drop JSON template packs into `templates/`.
- **Backup:** export and import any app's configuration as JSON.

## Quick start

### On-premise (Docker, recommended)

```bash
docker compose up -d
# open http://<server-ip>:8080 — the first account you create is the administrator
```

Set `PUBLIC_URL` to the address phones use to reach the server (e.g. `http://192.168.1.20:8080`). This makes download links and in-app lead forms work from phones on your network. All data lives in `./data`. The image contains the complete Android toolchain with a pre-warmed Gradle cache, so builds need **no internet access**.

### Cloud

```bash
cp .env.example deploy/.env      # set SECRET_KEY, PUBLIC_URL, passwords
docker compose -f deploy/docker-compose.cloud.yml up -d --scale worker=3
```

Or deploy the Kubernetes manifests in `deploy/kubernetes/` (`kubectl apply -k deploy/kubernetes`). See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for AWS, GCP and Azure notes.

### Local development (no Docker)

Requirements: Node.js ≥ 22.5, plus JDK 17+, Gradle 8.9+ and an Android SDK (platform 35, build-tools 35) for building APKs.

```bash
npm install
ANDROID_HOME=$HOME/Android/Sdk npm run dev     # http://localhost:8080
npm test                                       # 58 tests; includes a real APK build when ANDROID_HOME is set
```

## How it works

```
 Browser ── builder UI (web/) ──► API (server/) ──► DB: SQLite | Postgres
     ▲  live preview iframe            │            Storage: disk | S3
     └── runtime/ (same code as APK)   ▼
                                  build queue ──► worker(s): template + runtime + config
                                                  → Gradle → signed APK/AAB → storage
```

An app is a single JSON document (theme, business info, pages). The **runtime** (`runtime/`) is a small HTML/JS app that renders that JSON. The **Android template** (`android-template/`) is a lightweight native shell (Java, no third-party dependencies) hosting the runtime in a WebView, with native handling of calls, WhatsApp, maps, email, sharing, downloads, file uploads and offline mode. A build copies the template, bundles the runtime, the config and uploaded images, writes the package name, app name, colours and launcher icon, then runs Gradle and signs the result with the app's key.

Details are in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Repository layout

| Path | What |
|---|---|
| `server/` | Node.js API, build worker, templates, tests |
| `web/` | Builder UI (vanilla JS, no build step) |
| `runtime/` | App runtime used by the APK and by the live preview |
| `android-template/` | Native Android shell project (Gradle) |
| `templates/` | Optional file-based custom templates |
| `deploy/` | Cloud docker-compose and Kubernetes manifests |
| `docs/` | Architecture, deployment and template guides |

## Configuration

All settings are environment variables. [`.env.example`](.env.example) lists them with comments. The most important ones:

| Variable | Default | Purpose |
|---|---|---|
| `DEPLOYMENT_MODE` | `onprem` | `onprem` or `cloud` (changes defaults for quotas and the embedded worker) |
| `PUBLIC_URL` | `http://localhost:8080` | URL phones use for downloads and lead submission |
| `SECRET_KEY` | auto (on-prem) | Signs sessions and encrypts keystore passwords. **Required in cloud.** |
| `DATABASE_URL` | SQLite | `postgres://…` to use PostgreSQL |
| `STORAGE_DRIVER` | `local` | `s3` for S3/MinIO/R2/GCS (`S3_*` variables) |
| `EMBEDDED_WORKER` | `true` on-prem | Run builds inside the API process |
| `WORKER_CONCURRENCY` | `1` | Parallel builds per worker |
| `ALLOW_SIGNUP` | `true` | Disable public sign-up after the first admin |

Admin CLI: `npm run create-admin -- admin@example.com 'a-strong-password'`.

## Security notes

- Passwords are hashed with scrypt. Sessions and download links use HMAC-signed tokens.
- Keystore passwords are encrypted at rest (AES-256-GCM, keyed by `SECRET_KEY`). **Back up `SECRET_KEY`.** Without it, existing signing keys can't be used, and apps can't be updated on users' phones or Google Play.
- Uploads are type-checked by magic bytes. The preview runs in a sandboxed iframe, and all user content is escaped by the runtime.
- Users are isolated from each other. Admins can see everything.
- Put the server behind HTTPS (reverse proxy or ingress) when it's exposed to the internet.

## License

MIT
