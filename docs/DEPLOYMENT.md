# Deployment guide

APK Creator ships as two Docker image targets built from the same `Dockerfile`:

| Target | Contents | Use for |
|---|---|---|
| `builder` (default) | Node.js app + JDK 17 + Android SDK 35 + Gradle 8.14 with a pre-warmed offline cache (~2.6 GB) | all-in-one on-premise server, build workers |
| `server` | Node.js app only (~360 MB) | stateless API/web replicas in the cloud |

```bash
docker build --target builder -t apk-creator .
docker build --target server  -t apk-creator-server .
```

---

## 1. On-premise: single server

Hardware: 2 vCPU, 4 GB RAM and 20 GB disk handle a small team. A typical build takes 15–40 s.

```bash
git clone <this repo> apk-creator && cd apk-creator
PUBLIC_URL=http://192.168.1.20:8080 docker compose up -d
```

- Open `http://<server>:8080` and register. **The first account becomes the administrator.** Alternatively, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to create it at start-up.
- `PUBLIC_URL` must be reachable by **phones**, for APK download links and for in-app contact/booking/order forms that send to the dashboard inbox.
- To stop strangers registering, set `ALLOW_SIGNUP=false` and create accounts in **Admin → Users**.
- Data (SQLite DB, uploads, keystores, APKs, `secret.key`) lives in `./data`. **Back up this folder.** The keystores and `secret.key` are needed to publish updates of your apps.

### Air-gapped networks

The `builder` image compiles the Android template once at image-build time, so every Gradle dependency is already cached. `GRADLE_OFFLINE=true` (the compose default) makes builds use only that cache. Build the image on a connected machine, then transfer it:

```bash
docker save apk-creator:latest | gzip > apk-creator.tar.gz
# on the offline server
docker load < apk-creator.tar.gz && docker compose up -d
```

### Without Docker

Install Node.js ≥ 22.5, JDK 17+, Gradle ≥ 8.9 and the Android SDK (`platforms;android-35`, `build-tools;35.0.0`), then:

```bash
npm install
ANDROID_HOME=/opt/android-sdk PUBLIC_URL=http://server:8080 npm start
```

Run it under systemd or another process manager, and put nginx or Caddy in front for HTTPS.

### HTTPS reverse proxy (nginx)

```nginx
server {
  listen 443 ssl;
  server_name apps.example.com;
  client_max_body_size 80m;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Set `TRUST_PROXY=true` and `PUBLIC_URL=https://apps.example.com`.

---

## 2. On-premise or cloud: scaled

`deploy/docker-compose.cloud.yml` runs the production topology on one host: API, N build workers, Postgres and MinIO.

```bash
cp .env.example deploy/.env       # set SECRET_KEY (openssl rand -hex 32), PUBLIC_URL, passwords
docker compose -f deploy/docker-compose.cloud.yml up -d --scale worker=3
```

Workers are stateless and pull jobs from the database queue. Add more on other machines by pointing them at the same `DATABASE_URL` and S3 bucket:

```bash
docker run -d --name apkc-worker \
  -e DEPLOYMENT_MODE=cloud -e NODE_ENV=production -e SECRET_KEY=... \
  -e DATABASE_URL=postgres://... -e STORAGE_DRIVER=s3 -e S3_BUCKET=... -e S3_ENDPOINT=... \
  -e S3_ACCESS_KEY_ID=... -e S3_SECRET_ACCESS_KEY=... -e PUBLIC_URL=https://apps.example.com \
  apk-creator node --disable-warning=ExperimentalWarning server/src/worker.js
```

> Every API replica and worker **must share the same `SECRET_KEY`**. It signs sessions and download links, and it encrypts signing-key passwords.

---

## 3. Kubernetes

```bash
# 1. Build & push images to your registry, then edit deploy/kubernetes/kustomization.yaml
# 2. Create real secrets (don't commit them):
kubectl create namespace apk-creator
kubectl -n apk-creator create secret generic apk-creator-secrets \
  --from-literal=SECRET_KEY=$(openssl rand -hex 32) \
  --from-literal=DATABASE_URL='postgres://user:pass@db-host:5432/apkc' \
  --from-literal=S3_ACCESS_KEY_ID=... --from-literal=S3_SECRET_ACCESS_KEY=...
# 3. Remove the example Secret from config.yaml, set PUBLIC_URL / bucket / host, then:
kubectl apply -k deploy/kubernetes
```

The manifests include:
- an `apk-creator-api` Deployment (2 replicas, health probes), Service and Ingress
- an `apk-creator-worker` Deployment with a CPU-based HPA (1–10 pods), a 10-minute termination grace period so running builds finish, and an `emptyDir` for build workspaces

For queue-based autoscaling, use KEDA with a PostgreSQL scaler on `SELECT COUNT(*) FROM builds WHERE status='queued'`.

### Managed services by cloud

| Cloud | Database | Object storage | Notes |
|---|---|---|---|
| AWS | RDS / Aurora PostgreSQL | S3 (`S3_REGION`, no endpoint) | EKS or ECS Fargate (workers need 2 vCPU / 3 GB) |
| Google Cloud | Cloud SQL for PostgreSQL | GCS via S3 interop (`S3_ENDPOINT=https://storage.googleapis.com`, HMAC keys) | GKE or Cloud Run (API) + GKE (workers) |
| Azure | Azure Database for PostgreSQL | MinIO gateway or any S3-compatible service | AKS |
| Others | any PostgreSQL ≥ 12 | Cloudflare R2, Backblaze B2, Wasabi, MinIO | `S3_FORCE_PATH_STYLE=true` for MinIO |

Set `DATABASE_SSL=true` for managed databases that require TLS.

---

## AI assistants and native project builds

The MCP endpoint (`/mcp`) is served by the API process, so it needs no extra deployment: users create an API key on the **AI & API** page and connect their assistant ([AI.md](AI.md)). Make sure your reverse proxy allows request bodies of a few megabytes on `/mcp` and `/api/apps/*/files`, because assistants upload source files there (`client_max_body_size 80m` covers the default limits).

`PROJECT_BUILDS` decides who may compile uploaded Gradle projects, whose build scripts run on the worker: `admin` by default on-premise, `off` in the cloud. If you enable it for all users, keep workers in their own containers (as in the cloud layouts above) and give those containers nothing beyond the database and storage credentials they need. Projects that use Kotlin, AndroidX or other libraries need the worker to reach `dl.google.com`, `maven.google.com` and `repo.maven.apache.org`.

---

## Operations

- **Health:** `GET /api/health` returns 200 when the database is reachable.
- **Admin dashboard:** users, recent builds (owner, worker, status), queue depth and system info.
- **Logs:** the API logs to stdout. Build logs are stored per build and shown in the UI.
- **Stale builds:** a worker marks builds failed when their heartbeat is older than `BUILD_STALE_MINUTES` (default 30).
- **Upgrades:** pull the new image and restart. Database migrations run automatically at start-up.
- **Backups:** the database (SQLite file or `pg_dump`), the storage (directory or bucket), and `SECRET_KEY`.
- **CLI:** `docker compose exec apk-creator node server/src/cli.js create-admin you@example.com 'password'` (also `reset-password`).
